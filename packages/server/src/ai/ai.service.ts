import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  AiChatRequest,
  AiChatResponse,
  AiChatStreamEvent,
  AiRuntimeConfig,
  AiSource,
  PersistedAiConfig,
} from '@juejin-flow/shared';
import { chunkMarkdownContent } from '../content/chunking';
import {
  ContentIndexService,
  ContentSearchResult,
  SemanticSearchResult,
} from '../content/content-index.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_SOURCE_COUNT = 5;
const MAX_SOURCES_PER_CHAPTER = 1;
const MAX_CHAPTERS = 250;
const MAX_SELECTED_TEXT = 2000;
const MAX_MODEL_CONTEXT_CHARS = 8000;
const STREAM_CHUNK_SIZE = 80;
const DEFAULT_AI_CONFIG_ID = 'default';
const CJK_STOP_CHARACTERS = new Set([
  '的',
  '了',
  '是',
  '什',
  '么',
  '怎',
  '吗',
  '呢',
  '啊',
  '吧',
  '和',
  '与',
  '或',
  '及',
  '并',
  '在',
  '有',
  '哪',
  '些',
  '这',
  '那',
  '个',
  '中',
  '里',
  '上',
  '下',
  '从',
  '到',
  '对',
  '把',
  '被',
]);

type ChapterRecord = {
  id: string;
  bookId: string;
  title: string;
  content: string | null;
  book: {
    title: string;
  };
};

type RankedChunk = {
  id: string;
  chapter: ChapterRecord;
  chunkIndex: number;
  text: string;
  score: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type PreparedChat = {
  message: string;
  sources: AiSource[];
  config: Required<AiRuntimeConfig>;
};

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private contentIndex: ContentIndexService,
  ) {}

  async getConfig(): Promise<PersistedAiConfig> {
    const persisted = await this.readPersistedConfig();
    const config = await this.resolveConfig(persisted ?? undefined);

    return {
      id: DEFAULT_AI_CONFIG_ID,
      mode: config.mode,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      updatedAt: persisted?.updatedAt,
    };
  }

  async updateConfig(config: AiRuntimeConfig): Promise<PersistedAiConfig> {
    if (config.mode !== 'local' && config.mode !== 'openai-compatible') {
      throw new BadRequestException('Unsupported AI mode');
    }

    const saved = await this.prisma.aiConfig.upsert({
      where: { id: DEFAULT_AI_CONFIG_ID },
      update: {
        mode: config.mode,
        baseUrl: config.baseUrl?.trim() || null,
        model: config.model?.trim() || null,
        apiKey: config.apiKey?.trim() || null,
      },
      create: {
        id: DEFAULT_AI_CONFIG_ID,
        mode: config.mode,
        baseUrl: config.baseUrl?.trim() || null,
        model: config.model?.trim() || null,
        apiKey: config.apiKey?.trim() || null,
      },
    });

    return {
      id: saved.id,
      mode: saved.mode === 'openai-compatible' ? 'openai-compatible' : 'local',
      baseUrl: saved.baseUrl ?? undefined,
      model: saved.model ?? undefined,
      apiKey: saved.apiKey ?? undefined,
      updatedAt: saved.updatedAt,
    };
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const { message, sources, config } = await this.prepareChat(request);

    if (config.mode === 'openai-compatible') {
      try {
        const answer = await this.callOpenAICompatible(
          message,
          sources,
          request,
          config,
        );
        return {
          answer,
          sources,
          mode: 'openai-compatible',
          model: config.model,
        };
      } catch (error) {
        if (!sources.length) {
          throw error;
        }

        return {
          answer: this.createExtractiveAnswer(sources),
          sources,
          mode: 'local-extractive',
          model: config.model,
          notice:
            error instanceof Error
              ? `Model request failed: ${error.message}`
              : 'Model request failed',
        };
      }
    }

    return {
      answer: this.createExtractiveAnswer(sources),
      sources,
      mode: 'local-extractive',
    };
  }

  async *streamChat(request: AiChatRequest): AsyncGenerator<AiChatStreamEvent> {
    const { message, sources, config } = await this.prepareChat(request);

    yield {
      type: 'meta',
      sources,
      mode:
        config.mode === 'openai-compatible'
          ? 'openai-compatible'
          : 'local-extractive',
      model: config.mode === 'openai-compatible' ? config.model : undefined,
    };

    if (config.mode === 'openai-compatible') {
      let answer = '';

      try {
        for await (const delta of this.callOpenAICompatibleStream(
          message,
          sources,
          request,
          config,
        )) {
          answer += delta;
          yield {
            type: 'delta',
            delta,
          };
        }

        const response = {
          answer: answer.trim(),
          sources,
          mode: 'openai-compatible' as const,
          model: config.model,
        };

        if (!response.answer) {
          throw new BadGatewayException(
            'Model response did not include an answer',
          );
        }

        yield {
          type: 'done',
          response,
        };
        return;
      } catch (error) {
        if (!sources.length) {
          throw error;
        }

        const notice =
          error instanceof Error
            ? `Model request failed: ${error.message}`
            : 'Model request failed';
        yield {
          type: 'notice',
          notice,
        };

        const fallbackAnswer = this.createExtractiveAnswer(sources);
        for (const delta of this.chunkForStreaming(fallbackAnswer)) {
          yield {
            type: 'delta',
            delta,
          };
        }

        yield {
          type: 'done',
          response: {
            answer: fallbackAnswer,
            sources,
            mode: 'local-extractive',
            model: config.model,
            notice,
          },
        };
        return;
      }
    }

    const answer = this.createExtractiveAnswer(sources);
    for (const delta of this.chunkForStreaming(answer)) {
      yield {
        type: 'delta',
        delta,
      };
    }

    yield {
      type: 'done',
      response: {
        answer,
        sources,
        mode: 'local-extractive',
      },
    };
  }

  private async prepareChat(request: AiChatRequest): Promise<PreparedChat> {
    const message = request.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    return {
      message,
      sources: await this.retrieveSources(request),
      config: await this.resolveConfig(request.config),
    };
  }

  private async retrieveSources(request: AiChatRequest): Promise<AiSource[]> {
    const context = request.context;
    const selectedText =
      context?.selectedText?.slice(0, MAX_SELECTED_TEXT) ?? '';
    const queryText = `${request.message} ${selectedText}`;
    const terms = this.buildTerms(queryText, true);
    const searchQuery = this.buildSearchQuery(queryText);

    const [currentChunks, indexedMatches, semanticMatches] = await Promise.all([
      context?.chapterId
        ? this.prisma.chapterChunk.findMany({
            where: {
              chapterId: context.chapterId,
            },
            select: this.chunkSelect(),
            orderBy: { chunkIndex: 'asc' },
            take: 20,
          })
        : Promise.resolve([]),
      this.retrieveIndexedMatches(searchQuery, context?.bookId),
      this.retrieveSemanticMatches(queryText, context?.bookId),
    ]);

    const matchingChunks =
      indexedMatches.length > 0
        ? []
        : await this.retrieveMatchingChunks(terms, context?.bookId);

    const currentRankedChunks = this.dedupeStoredChunks([
      ...currentChunks,
      ...matchingChunks,
    ]).map((chunk) => ({
      id: chunk.id,
      chunkIndex: chunk.chunkIndex,
      chapter: chunk.chapter,
      text: chunk.content,
      score: this.scoreChunk(
        chunk.content,
        chunk.chapter,
        terms,
        context?.chapterId,
      ),
    }));

    const indexedRankedChunks = indexedMatches.map((match, index) => {
      const chapter = {
        id: match.chapterId,
        bookId: match.bookId,
        title: match.chapterTitle,
        content: null,
        book: {
          title: match.bookTitle,
        },
      };

      return {
        id: match.chunkId,
        chunkIndex: index,
        chapter,
        text: match.content,
        score:
          match.score +
          this.scoreChunk(match.content, chapter, terms, context?.chapterId),
      };
    });

    const semanticRankedChunks = semanticMatches.map((match, index) => {
      const chapter = {
        id: match.chapterId,
        bookId: match.bookId,
        title: match.chapterTitle,
        content: null,
        book: {
          title: match.bookTitle,
        },
      };

      return {
        id: match.chunkId,
        chunkIndex: index,
        chapter,
        text: match.content,
        score:
          match.score +
          this.scoreChunk(match.content, chapter, terms, context?.chapterId),
      };
    });

    const indexedChunks = this.dedupeRankedChunks([
      ...currentRankedChunks,
      ...indexedRankedChunks,
      ...semanticRankedChunks,
    ]);

    const fallbackChunks =
      indexedChunks.length > 0
        ? []
        : await this.retrieveFallbackChunks(request);

    const ranked = this.pickTopChunks([...indexedChunks, ...fallbackChunks])
      .filter((chunk) => chunk.text.trim().length > 0 && chunk.score > 0)
      .slice(0, MAX_SOURCE_COUNT);

    return ranked.map((chunk, index) => this.toSource(chunk, index));
  }

  private async retrieveIndexedMatches(
    searchQuery: string,
    bookId?: string,
  ): Promise<ContentSearchResult[]> {
    if (!searchQuery) {
      return [];
    }

    const strictMatches = await this.contentIndex.search(searchQuery, {
      bookId,
      limit: MAX_CHAPTERS,
      mode: 'and',
    });

    if (strictMatches.length >= MAX_SOURCE_COUNT) {
      return strictMatches;
    }

    const looseMatches = await this.contentIndex.search(searchQuery, {
      bookId,
      limit: MAX_CHAPTERS,
      mode: 'or',
    });

    const seen = new Set(strictMatches.map((match) => match.chunkId));
    return [
      ...strictMatches,
      ...looseMatches.filter((match) => {
        if (seen.has(match.chunkId)) {
          return false;
        }
        seen.add(match.chunkId);
        return true;
      }),
    ];
  }

  private retrieveSemanticMatches(
    query: string,
    bookId?: string,
  ): Promise<SemanticSearchResult[]> {
    if (!query.trim()) {
      return Promise.resolve([]);
    }

    return this.contentIndex.semanticSearch(query, {
      bookId,
      limit: MAX_SOURCE_COUNT * 4,
    });
  }

  private async retrieveMatchingChunks(terms: string[], bookId?: string) {
    const chunkWhereTerms = terms.length
      ? {
          OR: terms.map((term) => ({
            content: { contains: term },
          })),
        }
      : {};

    return this.prisma.chapterChunk.findMany({
      where: {
        ...chunkWhereTerms,
        chapter: {
          ...(bookId ? { bookId } : {}),
        },
      },
      select: this.chunkSelect(),
      orderBy: [{ chapterId: 'asc' }, { chunkIndex: 'asc' }],
      take: MAX_CHAPTERS,
    });
  }

  private chunkSelect() {
    return {
      id: true,
      content: true,
      chunkIndex: true,
      chapter: {
        select: {
          id: true,
          bookId: true,
          title: true,
          content: true,
          book: { select: { title: true } },
        },
      },
    } as const;
  }

  private dedupeStoredChunks<
    T extends {
      id: string;
      content: string;
      chunkIndex: number;
      chapter: ChapterRecord;
    },
  >(chunks: T[]) {
    const seen = new Set<string>();
    return chunks.filter((chunk) => {
      if (seen.has(chunk.id)) {
        return false;
      }
      seen.add(chunk.id);
      return true;
    });
  }

  private dedupeRankedChunks(chunks: RankedChunk[]) {
    const seen = new Set<string>();
    return chunks.filter((chunk) => {
      if (seen.has(chunk.id)) {
        return false;
      }
      seen.add(chunk.id);
      return true;
    });
  }

  private async retrieveFallbackChunks(
    request: AiChatRequest,
  ): Promise<RankedChunk[]> {
    const context = request.context;
    const selectedText =
      context?.selectedText?.slice(0, MAX_SELECTED_TEXT) ?? '';
    const terms = this.buildTerms(`${request.message} ${selectedText}`, true);

    const chapters = await this.prisma.chapter.findMany({
      where: {
        ...(context?.bookId ? { bookId: context.bookId } : {}),
        content: { not: null },
      },
      select: {
        id: true,
        bookId: true,
        title: true,
        content: true,
        book: { select: { title: true } },
      },
      orderBy: [{ orderIndex: 'asc' }, { fileName: 'asc' }],
      take: MAX_CHAPTERS,
    });

    return chapters.flatMap((chapter) =>
      chunkMarkdownContent(chapter.content ?? '').map((chunk) => ({
        id: `${chapter.id}-${chunk.chunkIndex}`,
        chapter,
        chunkIndex: chunk.chunkIndex,
        text: chunk.content,
        score: this.scoreChunk(
          chunk.content,
          chapter,
          terms,
          context?.chapterId,
        ),
      })),
    );
  }

  private scoreChunk(
    text: string,
    chapter: ChapterRecord,
    terms: string[],
    currentChapterId?: string,
  ) {
    const haystack =
      `${chapter.book.title} ${chapter.title} ${text}`.toLowerCase();
    let score = chapter.id === currentChapterId ? 20 : 0;

    for (const term of terms) {
      if (chapter.title.toLowerCase().includes(term)) {
        score += 12;
      }
      if (haystack.includes(term)) {
        score += 4;
      }
    }

    return score;
  }

  private buildTerms(input: string, preferLatinPair = false) {
    const normalized = input.toLowerCase();
    const latinTerms = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
    const cjkTerms = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).filter(
      (term) => !CJK_STOP_CHARACTERS.has(term),
    );
    const terms =
      preferLatinPair && latinTerms.length >= 2
        ? latinTerms
        : [...latinTerms, ...cjkTerms];

    return Array.from(new Set(terms)).slice(0, 30);
  }

  private buildSearchQuery(input: string) {
    return this.buildTerms(input, true).join(' ');
  }

  private pickTopChunks(chunks: RankedChunk[]) {
    const sorted = [...chunks]
      .filter((chunk) => chunk.text.trim().length > 0 && chunk.score > 0)
      .sort((a, b) => b.score - a.score);
    const chapterCounts = new Map<string, number>();
    const picked: RankedChunk[] = [];
    const overflow: RankedChunk[] = [];

    for (const chunk of sorted) {
      const count = chapterCounts.get(chunk.chapter.id) ?? 0;
      if (count < MAX_SOURCES_PER_CHAPTER) {
        picked.push(chunk);
        chapterCounts.set(chunk.chapter.id, count + 1);
      } else {
        overflow.push(chunk);
      }
    }

    return [...picked, ...overflow];
  }

  private toSource(chunk: RankedChunk, index: number): AiSource {
    return {
      id: chunk.id || `${chunk.chapter.id}-${index}`,
      bookId: chunk.chapter.bookId,
      chapterId: chunk.chapter.id,
      bookTitle: chunk.chapter.book.title,
      chapterTitle: chunk.chapter.title,
      excerpt: this.trimExcerpt(chunk.text, 360),
      relevance: Math.max(1, Math.round(chunk.score)),
    };
  }

  private trimExcerpt(text: string, maxLength: number) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 3)}...`
      : normalized;
  }

  private createExtractiveAnswer(sources: AiSource[]) {
    if (!sources.length) {
      return '没有在本地书库里找到足够相关的章节内容。';
    }

    const bullets = sources
      .slice(0, 3)
      .map((source, index) => `${index + 1}. ${source.excerpt} [${index + 1}]`)
      .join('\n\n');

    return `基于本地资料：\n\n${bullets}\n\n如需更完整的综合回答，请在设置中配置 OpenAI 兼容模型。`;
  }

  private async resolveConfig(
    config?: AiRuntimeConfig,
  ): Promise<Required<AiRuntimeConfig>> {
    const persisted = config ? undefined : await this.readPersistedConfig();
    const envBaseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;
    const envApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    const envModel = process.env.AI_MODEL || process.env.OPENAI_MODEL;
    const mode =
      config?.mode ??
      persisted?.mode ??
      (envBaseUrl || envApiKey || envModel ? 'openai-compatible' : 'local');

    return {
      mode,
      baseUrl:
        config?.baseUrl ||
        persisted?.baseUrl ||
        envBaseUrl ||
        'https://api.openai.com/v1',
      apiKey: config?.apiKey || persisted?.apiKey || envApiKey || '',
      model: config?.model || persisted?.model || envModel || 'gpt-4o-mini',
    };
  }

  private async readPersistedConfig() {
    const aiConfig = (
      this.prisma as PrismaService & {
        aiConfig?: PrismaService['aiConfig'];
      }
    ).aiConfig;

    if (!aiConfig) {
      return null;
    }

    const saved = await aiConfig.findUnique({
      where: { id: DEFAULT_AI_CONFIG_ID },
    });

    if (!saved) {
      return null;
    }

    return {
      mode: saved.mode === 'openai-compatible' ? 'openai-compatible' : 'local',
      baseUrl: saved.baseUrl ?? undefined,
      model: saved.model ?? undefined,
      apiKey: saved.apiKey ?? undefined,
      updatedAt: saved.updatedAt,
    } satisfies AiRuntimeConfig & { updatedAt?: Date };
  }

  private async callOpenAICompatible(
    message: string,
    sources: AiSource[],
    request: AiChatRequest,
    config: Required<AiRuntimeConfig>,
  ) {
    const contextText = sources
      .map(
        (source, index) =>
          `[${index + 1}] ${source.bookTitle} / ${source.chapterTitle}\n${source.excerpt}`,
      )
      .join('\n\n')
      .slice(0, MAX_MODEL_CONTEXT_CHARS);

    const selectedText = request.context?.selectedText
      ? `\nSelected text:\n${request.context.selectedText.slice(0, MAX_SELECTED_TEXT)}`
      : '';

    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are a study assistant for a local Markdown library. Answer using only the provided context. Cite sources with bracket numbers like [1]. If the context is insufficient, say so briefly.',
            },
            {
              role: 'user',
              content: `Question:\n${message}${selectedText}\n\nContext:\n${contextText}`,
            },
          ],
        }),
      },
    );

    const payload = (await response
      .json()
      .catch(() => ({}))) as ChatCompletionResponse;

    if (!response.ok) {
      throw new BadGatewayException(
        payload.error?.message ||
          `Model request failed with status ${response.status}`,
      );
    }

    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new BadGatewayException('Model response did not include an answer');
    }

    return answer;
  }

  private async *callOpenAICompatibleStream(
    message: string,
    sources: AiSource[],
    request: AiChatRequest,
    config: Required<AiRuntimeConfig>,
  ) {
    const contextText = sources
      .map(
        (source, index) =>
          `[${index + 1}] ${source.bookTitle} / ${source.chapterTitle}\n${source.excerpt}`,
      )
      .join('\n\n')
      .slice(0, MAX_MODEL_CONTEXT_CHARS);

    const selectedText = request.context?.selectedText
      ? `\nSelected text:\n${request.context.selectedText.slice(0, MAX_SELECTED_TEXT)}`
      : '';

    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          stream: true,
          messages: [
            {
              role: 'system',
              content:
                'You are a study assistant for a local Markdown library. Answer using only the provided context. Cite sources with bracket numbers like [1]. If the context is insufficient, say so briefly.',
            },
            {
              role: 'user',
              content: `Question:\n${message}${selectedText}\n\nContext:\n${contextText}`,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => ({}))) as ChatCompletionResponse;
      throw new BadGatewayException(
        payload.error?.message ||
          `Model request failed with status ${response.status}`,
      );
    }

    if (!response.body) {
      throw new BadGatewayException('Model response did not include a stream');
    }

    const reader: ReadableStreamDefaultReader<Uint8Array> =
      response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const delta = this.parseOpenAIStreamLine(line);
          if (delta === null) {
            return;
          }
          if (delta) {
            yield delta;
          }
        }
      }

      buffer += decoder.decode();
      const delta = this.parseOpenAIStreamLine(buffer);
      if (delta) {
        yield delta;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseOpenAIStreamLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return '';
    }

    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      return null;
    }

    if (!data) {
      return '';
    }

    const payload = JSON.parse(data) as ChatCompletionStreamChunk;
    if (payload.error?.message) {
      throw new BadGatewayException(payload.error.message);
    }

    return payload.choices?.[0]?.delta?.content ?? '';
  }

  private chunkForStreaming(answer: string) {
    const chunks: string[] = [];
    for (let index = 0; index < answer.length; index += STREAM_CHUNK_SIZE) {
      chunks.push(answer.slice(index, index + STREAM_CHUNK_SIZE));
    }
    return chunks;
  }
}
