import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  AiChatRequest,
  AiChatResponse,
  AiRuntimeConfig,
  AiSource,
} from '@juejin-flow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { chunkMarkdownContent } from '../content/chunking';

const MAX_SOURCE_COUNT = 5;
const MAX_CHAPTERS = 250;
const MAX_SELECTED_TEXT = 2000;
const MAX_MODEL_CONTEXT_CHARS = 8000;

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

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const message = request.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    const sources = await this.retrieveSources(request);
    const config = this.resolveConfig(request.config);

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

  private async retrieveSources(request: AiChatRequest): Promise<AiSource[]> {
    const context = request.context;
    const selectedText =
      context?.selectedText?.slice(0, MAX_SELECTED_TEXT) ?? '';
    const terms = this.buildTerms(`${request.message} ${selectedText}`);

    const chunkWhereTerms = terms.length
      ? {
          OR: terms.map((term) => ({
            content: { contains: term },
          })),
        }
      : {};

    const [currentChunks, matchingChunks] = await Promise.all([
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
      this.prisma.chapterChunk.findMany({
        where: {
          ...chunkWhereTerms,
          chapter: {
            ...(context?.bookId ? { bookId: context.bookId } : {}),
          },
        },
        select: this.chunkSelect(),
        orderBy: [{ chapterId: 'asc' }, { chunkIndex: 'asc' }],
        take: MAX_CHAPTERS,
      }),
    ]);

    const indexedChunks = this.dedupeRankedChunks([
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

    const fallbackChunks =
      indexedChunks.length > 0
        ? []
        : await this.retrieveFallbackChunks(request);

    const ranked = [...indexedChunks, ...fallbackChunks]
      .filter((chunk) => chunk.text.trim().length > 0 && chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SOURCE_COUNT);

    return ranked.map((chunk, index) => this.toSource(chunk, index));
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

  private dedupeRankedChunks<
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

  private async retrieveFallbackChunks(
    request: AiChatRequest,
  ): Promise<RankedChunk[]> {
    const context = request.context;
    const selectedText =
      context?.selectedText?.slice(0, MAX_SELECTED_TEXT) ?? '';
    const terms = this.buildTerms(`${request.message} ${selectedText}`);

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

  private buildTerms(input: string) {
    const normalized = input.toLowerCase();
    const latinTerms = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
    const cjkTerms = normalized.match(/[\u4e00-\u9fff]/g) ?? [];
    return Array.from(new Set([...latinTerms, ...cjkTerms])).slice(0, 30);
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
      return 'I could not find relevant local chapter content for this question.';
    }

    const bullets = sources
      .slice(0, 3)
      .map((source, index) => `${index + 1}. ${source.excerpt} [${index + 1}]`)
      .join('\n\n');

    return `Based on the local notes:\n\n${bullets}\n\nConfigure an OpenAI-compatible model for a synthesized answer.`;
  }

  private resolveConfig(config?: AiRuntimeConfig): Required<AiRuntimeConfig> {
    const envBaseUrl = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;
    const envApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    const envModel = process.env.AI_MODEL || process.env.OPENAI_MODEL;
    const mode =
      config?.mode ??
      (envBaseUrl || envApiKey || envModel ? 'openai-compatible' : 'local');

    return {
      mode,
      baseUrl: config?.baseUrl || envBaseUrl || 'https://api.openai.com/v1',
      apiKey: config?.apiKey || envApiKey || '',
      model: config?.model || envModel || 'gpt-4o-mini',
    };
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
}
