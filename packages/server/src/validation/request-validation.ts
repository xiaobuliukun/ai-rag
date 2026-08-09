import { BadRequestException, PipeTransform } from '@nestjs/common';
import { REPLACE_BACKUP_CONFIRMATION } from '@moxu/shared';
import type {
  AiChatRequest,
  AiConfigUpdateRequest,
  AiRuntimeConfig,
  BackupAiConfig,
  BackupPayload,
  CreateBookmarkRequest,
  ImportBackupRequest,
  SearchResultType,
  UpdateBookRequest,
  UpdateBookmarkRequest,
  UpdateProgressRequest,
} from '@moxu/shared';

type PlainObject = Record<string, unknown>;
type Validator<T> = (value: unknown) => T;

const MAX_ID_LENGTH = 512;
const MAX_PATH_LENGTH = 4096;
const MAX_AI_MESSAGE_LENGTH = 20_000;
const MAX_AI_SELECTED_TEXT_LENGTH = 2_000;
const MAX_AI_HISTORY_MESSAGES = 12;
const MAX_AI_HISTORY_MESSAGE_LENGTH = 1_200;
const MAX_API_KEY_LENGTH = 8_192;
const MAX_TITLE_LENGTH = 1_000;
const MAX_DESCRIPTION_LENGTH = 100_000;
const MAX_TAG_LENGTH = 100;
const MAX_TAGS = 12;
const MAX_COVER_IMAGE_LENGTH = 2_100_000;
const MAX_BOOKMARK_NOTE_LENGTH = 20_000;
const MAX_BOOKMARK_EXCERPT_LENGTH = 100_000;
const MAX_SEARCH_QUERY_LENGTH = 500;
const MAX_BACKUP_COLLECTION_LENGTH = 100_000;
const MAX_CHAPTER_CONTENT_LENGTH = 20_000_000;
const MAX_SCROLL_POSITION = 1_000_000_000;
const MAX_READING_SECONDS_DELTA = 15 * 60;

const AI_CONFIG_KEYS = [
  'mode',
  'baseUrl',
  'model',
  'apiKey',
  'embeddingProvider',
  'embeddingModel',
  'ragSourceCount',
  'ragContextChars',
  'ragExcerptChars',
] as const;

export class RequestValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly validator: Validator<T>) {}

  transform(value: unknown): T {
    return this.validator(value);
  }
}

export function validateAiChatRequest(value: unknown): AiChatRequest {
  const request = requireObject(value, 'body');
  rejectUnknownKeys(
    request,
    ['message', 'context', 'config', 'history'],
    'body',
  );
  requireNonEmptyString(request.message, 'message', MAX_AI_MESSAGE_LENGTH);

  if (request.context !== undefined) {
    const context = requireObject(request.context, 'context');
    rejectUnknownKeys(
      context,
      ['bookId', 'chapterId', 'bookTitle', 'chapterTitle', 'selectedText'],
      'context',
    );
    optionalString(context.bookId, 'context.bookId', MAX_ID_LENGTH, true);
    optionalString(context.chapterId, 'context.chapterId', MAX_ID_LENGTH, true);
    optionalString(context.bookTitle, 'context.bookTitle', MAX_TITLE_LENGTH);
    optionalString(
      context.chapterTitle,
      'context.chapterTitle',
      MAX_TITLE_LENGTH,
    );
    optionalString(
      context.selectedText,
      'context.selectedText',
      MAX_AI_SELECTED_TEXT_LENGTH,
    );
  }

  if (request.config !== undefined) {
    validateAiRuntimeConfig(request.config, false);
  }

  if (request.history !== undefined) {
    const history = requireArray(
      request.history,
      'history',
      MAX_AI_HISTORY_MESSAGES,
    );
    history.forEach((entry, index) => {
      const message = requireObject(entry, `history[${index}]`);
      rejectUnknownKeys(message, ['role', 'content'], `history[${index}]`);
      requireEnum(message.role, `history[${index}].role`, [
        'user',
        'assistant',
      ] as const);
      requireNonEmptyString(
        message.content,
        `history[${index}].content`,
        MAX_AI_HISTORY_MESSAGE_LENGTH,
      );
    });
  }

  return request as unknown as AiChatRequest;
}

export function validateAiConfigUpdate(value: unknown): AiConfigUpdateRequest {
  const config = validateAiRuntimeConfig(value, true);
  const request = config as unknown as PlainObject;
  optionalBoolean(request.clearApiKey, 'clearApiKey');

  if (
    request.clearApiKey === true &&
    typeof request.apiKey === 'string' &&
    request.apiKey.trim()
  ) {
    fail('apiKey', 'cannot be provided when clearApiKey is true');
  }

  return config as AiConfigUpdateRequest;
}

export function validateUpdateBookRequest(value: unknown): UpdateBookRequest {
  const request = requireObject(value, 'body');
  rejectUnknownKeys(
    request,
    ['title', 'description', 'tags', 'coverImage'],
    'body',
  );
  requireAtLeastOneKey(request, 'body');

  if (request.title !== undefined) {
    requireNonEmptyString(request.title, 'title', MAX_TITLE_LENGTH);
  }
  optionalNullableString(
    request.description,
    'description',
    MAX_DESCRIPTION_LENGTH,
  );
  optionalNullableString(
    request.coverImage,
    'coverImage',
    MAX_COVER_IMAGE_LENGTH,
  );

  if (request.tags !== undefined) {
    const tags = requireArray(request.tags, 'tags', MAX_TAGS);
    tags.forEach((tag, index) =>
      requireNonEmptyString(tag, `tags[${index}]`, MAX_TAG_LENGTH),
    );
  }

  return request as unknown as UpdateBookRequest;
}

export function validateProgressRequest(value: unknown): UpdateProgressRequest {
  const request = requireObject(value, 'body');
  rejectUnknownKeys(
    request,
    ['progress', 'scrollPosition', 'readingSecondsDelta'],
    'body',
  );
  requireFiniteNumber(request.progress, 'progress', 0, 100);
  optionalFiniteNumber(
    request.scrollPosition,
    'scrollPosition',
    0,
    MAX_SCROLL_POSITION,
  );
  optionalFiniteNumber(
    request.readingSecondsDelta,
    'readingSecondsDelta',
    0,
    MAX_READING_SECONDS_DELTA,
  );

  return request as unknown as UpdateProgressRequest;
}

export function validateCreateBookmarkRequest(
  value: unknown,
): CreateBookmarkRequest {
  const request = requireObject(value, 'body');
  rejectUnknownKeys(
    request,
    ['bookId', 'chapterId', 'note', 'excerpt', 'position'],
    'body',
  );
  requireNonEmptyString(request.bookId, 'bookId', MAX_ID_LENGTH);
  requireNonEmptyString(request.chapterId, 'chapterId', MAX_ID_LENGTH);
  requireNonEmptyString(request.note, 'note', MAX_BOOKMARK_NOTE_LENGTH);
  optionalString(request.excerpt, 'excerpt', MAX_BOOKMARK_EXCERPT_LENGTH);
  optionalFiniteNumber(request.position, 'position', 0, 100);

  return request as unknown as CreateBookmarkRequest;
}

export function validateUpdateBookmarkRequest(
  value: unknown,
): UpdateBookmarkRequest {
  const request = requireObject(value, 'body');
  rejectUnknownKeys(request, ['note', 'excerpt', 'position'], 'body');
  requireAtLeastOneKey(request, 'body');

  if (request.note !== undefined) {
    requireNonEmptyString(request.note, 'note', MAX_BOOKMARK_NOTE_LENGTH);
  }
  optionalNullableString(
    request.excerpt,
    'excerpt',
    MAX_BOOKMARK_EXCERPT_LENGTH,
  );
  optionalFiniteNumber(request.position, 'position', 0, 100);

  return request as unknown as UpdateBookmarkRequest;
}

export interface SearchQueryRequest {
  q?: string;
  bookId?: string;
  type?: SearchResultType;
}

export interface BookmarkQueryRequest {
  bookId?: string;
  chapterId?: string;
}

export function validateBookmarkQuery(value: unknown): BookmarkQueryRequest {
  const query = requireObject(value, 'query');
  rejectUnknownKeys(query, ['bookId', 'chapterId'], 'query');
  optionalString(query.bookId, 'bookId', MAX_ID_LENGTH, true);
  optionalString(query.chapterId, 'chapterId', MAX_ID_LENGTH, true);
  return query as BookmarkQueryRequest;
}

export function validateSearchQuery(value: unknown): SearchQueryRequest {
  const query = requireObject(value, 'query');
  rejectUnknownKeys(query, ['q', 'bookId', 'type'], 'query');
  optionalString(query.q, 'q', MAX_SEARCH_QUERY_LENGTH);
  optionalString(query.bookId, 'bookId', MAX_ID_LENGTH, true);
  if (query.type !== undefined) {
    requireEnum(query.type, 'type', [
      'all',
      'book',
      'chapter',
      'content',
    ] as const);
  }

  return query as SearchQueryRequest;
}

export function validateScanRequest(value: unknown): { path: string } {
  const request = requireObject(value, 'body');
  rejectUnknownKeys(request, ['path'], 'body');
  const path = requireNonEmptyString(request.path, 'path', MAX_PATH_LENGTH);
  return { path };
}

export function validateImportBackupRequest(
  value: unknown,
): BackupPayload | ImportBackupRequest {
  const request = requireObject(value, 'body');
  const wrapped = 'payload' in request;

  if (wrapped) {
    rejectUnknownKeys(
      request,
      ['payload', 'mode', 'replaceConfirmation'],
      'body',
    );
    if (request.mode !== undefined) {
      requireEnum(request.mode, 'mode', ['merge', 'replace'] as const);
    }
    if (request.replaceConfirmation !== undefined) {
      requireEnum(request.replaceConfirmation, 'replaceConfirmation', [
        REPLACE_BACKUP_CONFIRMATION,
      ] as const);
    }
    validateBackupPayload(request.payload, 'payload');
  } else {
    validateBackupPayload(request, 'body');
  }

  return request as unknown as BackupPayload | ImportBackupRequest;
}

export function validateIdentifier(value: unknown, field = 'id'): string {
  return requireNonEmptyString(value, field, MAX_ID_LENGTH);
}

function validateAiRuntimeConfig(
  value: unknown,
  allowClearApiKey: boolean,
): AiRuntimeConfig | AiConfigUpdateRequest {
  const config = requireObject(value, 'config');
  rejectUnknownKeys(
    config,
    allowClearApiKey ? [...AI_CONFIG_KEYS, 'clearApiKey'] : AI_CONFIG_KEYS,
    'config',
  );
  requireEnum(config.mode, 'mode', ['local', 'openai-compatible'] as const);
  optionalString(config.baseUrl, 'baseUrl', 2_048);
  if (typeof config.baseUrl === 'string' && config.baseUrl.trim()) {
    requireHttpUrl(config.baseUrl, 'baseUrl');
  }
  optionalString(config.model, 'model', 256);
  optionalString(config.apiKey, 'apiKey', MAX_API_KEY_LENGTH);
  if (config.embeddingProvider !== undefined) {
    requireEnum(config.embeddingProvider, 'embeddingProvider', [
      'local',
      'openai-compatible',
    ] as const);
  }
  optionalString(config.embeddingModel, 'embeddingModel', 256);
  optionalInteger(config.ragSourceCount, 'ragSourceCount', 2, 10);
  optionalInteger(config.ragContextChars, 'ragContextChars', 4_000, 24_000);
  optionalInteger(config.ragExcerptChars, 'ragExcerptChars', 240, 900);

  return config as unknown as AiRuntimeConfig | AiConfigUpdateRequest;
}

function validateBackupPayload(value: unknown, path: string): BackupPayload {
  const payload = requireObject(value, path);
  if (payload.version !== 1) {
    fail(`${path}.version`, 'must be 1');
  }
  requireDateString(payload.exportedAt, `${path}.exportedAt`);

  const books = requireArray(
    payload.books,
    `${path}.books`,
    MAX_BACKUP_COLLECTION_LENGTH,
  );
  const bookIds = new Set<string>();
  const bookPaths = new Set<string>();
  const chapterIds = new Set<string>();
  const chapterBookIds = new Map<string, string>();
  books.forEach((entry, bookIndex) => {
    const bookPath = `${path}.books[${bookIndex}]`;
    const book = requireObject(entry, bookPath);
    const bookId = requireNonEmptyString(
      book.id,
      `${bookPath}.id`,
      MAX_ID_LENGTH,
    );
    if (bookIds.has(bookId)) {
      fail(`${bookPath}.id`, 'must be unique');
    }
    bookIds.add(bookId);
    requireNonEmptyString(book.title, `${bookPath}.title`, MAX_TITLE_LENGTH);
    const identityPath = requireNonEmptyString(
      book.path,
      `${bookPath}.path`,
      MAX_PATH_LENGTH,
    );
    if (bookPaths.has(identityPath)) {
      fail(`${bookPath}.path`, 'must be unique');
    }
    bookPaths.add(identityPath);
    optionalNullableString(
      book.description,
      `${bookPath}.description`,
      MAX_DESCRIPTION_LENGTH,
    );
    optionalNullableString(
      book.coverImage,
      `${bookPath}.coverImage`,
      MAX_COVER_IMAGE_LENGTH,
    );
    requireDateLike(book.lastRead, `${bookPath}.lastRead`);
    optionalDateLike(book.createdAt, `${bookPath}.createdAt`);
    optionalDateLike(book.updatedAt, `${bookPath}.updatedAt`);

    if (book.tags !== undefined) {
      const tags = requireArray(book.tags, `${bookPath}.tags`, MAX_TAGS);
      tags.forEach((tag, tagIndex) =>
        requireNonEmptyString(
          tag,
          `${bookPath}.tags[${tagIndex}]`,
          MAX_TAG_LENGTH,
        ),
      );
    }

    const chapters = requireArray(
      book.chapters,
      `${bookPath}.chapters`,
      MAX_BACKUP_COLLECTION_LENGTH,
    );
    const chapterFileNames = new Set<string>();
    chapters.forEach((entry, chapterIndex) => {
      const chapterPath = `${bookPath}.chapters[${chapterIndex}]`;
      const chapter = requireObject(entry, chapterPath);
      const chapterId = requireNonEmptyString(
        chapter.id,
        `${chapterPath}.id`,
        MAX_ID_LENGTH,
      );
      if (chapterIds.has(chapterId)) {
        fail(`${chapterPath}.id`, 'must be unique');
      }
      chapterIds.add(chapterId);
      const chapterBookId = requireNonEmptyString(
        chapter.bookId,
        `${chapterPath}.bookId`,
        MAX_ID_LENGTH,
      );
      if (chapterBookId !== bookId) {
        fail(`${chapterPath}.bookId`, 'must match its parent book id');
      }
      chapterBookIds.set(chapterId, bookId);
      requireNonEmptyString(
        chapter.title,
        `${chapterPath}.title`,
        MAX_TITLE_LENGTH,
      );
      const fileName = requireNonEmptyString(
        chapter.fileName,
        `${chapterPath}.fileName`,
        MAX_PATH_LENGTH,
      );
      if (chapterFileNames.has(fileName)) {
        fail(`${chapterPath}.fileName`, 'must be unique within its book');
      }
      chapterFileNames.add(fileName);
      optionalNullableString(
        chapter.content,
        `${chapterPath}.content`,
        MAX_CHAPTER_CONTENT_LENGTH,
      );
      requireInteger(
        chapter.orderIndex,
        `${chapterPath}.orderIndex`,
        0,
        Number.MAX_SAFE_INTEGER,
      );
      requireBoolean(chapter.isRead, `${chapterPath}.isRead`);
      requireFiniteNumber(chapter.progress, `${chapterPath}.progress`, 0, 100);
      optionalDateLike(chapter.createdAt, `${chapterPath}.createdAt`);
      optionalDateLike(chapter.updatedAt, `${chapterPath}.updatedAt`);
      validateReadingProgress(chapter.readingProgress, chapterId, chapterPath);
      validateChunks(chapter.chunks, chapterPath);
    });
  });

  const bookmarks = requireArray(
    payload.bookmarks,
    `${path}.bookmarks`,
    MAX_BACKUP_COLLECTION_LENGTH,
  );
  const bookmarkIds = new Set<string>();
  bookmarks.forEach((entry, index) => {
    const bookmarkPath = `${path}.bookmarks[${index}]`;
    const bookmark = requireObject(entry, bookmarkPath);
    const id = requireNonEmptyString(
      bookmark.id,
      `${bookmarkPath}.id`,
      MAX_ID_LENGTH,
    );
    if (bookmarkIds.has(id)) {
      fail(`${bookmarkPath}.id`, 'must be unique');
    }
    bookmarkIds.add(id);
    const bookId = requireNonEmptyString(
      bookmark.bookId,
      `${bookmarkPath}.bookId`,
      MAX_ID_LENGTH,
    );
    const chapterId = requireNonEmptyString(
      bookmark.chapterId,
      `${bookmarkPath}.chapterId`,
      MAX_ID_LENGTH,
    );
    if (!bookIds.has(bookId) || !chapterIds.has(chapterId)) {
      fail(bookmarkPath, 'must reference a book and chapter in the backup');
    }
    if (chapterBookIds.get(chapterId) !== bookId) {
      fail(`${bookmarkPath}.chapterId`, 'must belong to the referenced book');
    }
    requireNonEmptyString(
      bookmark.note,
      `${bookmarkPath}.note`,
      MAX_BOOKMARK_NOTE_LENGTH,
    );
    optionalNullableString(
      bookmark.excerpt,
      `${bookmarkPath}.excerpt`,
      MAX_BOOKMARK_EXCERPT_LENGTH,
    );
    requireFiniteNumber(bookmark.position, `${bookmarkPath}.position`, 0, 100);
    requireDateLike(bookmark.createdAt, `${bookmarkPath}.createdAt`);
    optionalDateLike(bookmark.updatedAt, `${bookmarkPath}.updatedAt`);
    optionalString(
      bookmark.bookTitle,
      `${bookmarkPath}.bookTitle`,
      MAX_TITLE_LENGTH,
    );
    optionalString(
      bookmark.chapterTitle,
      `${bookmarkPath}.chapterTitle`,
      MAX_TITLE_LENGTH,
    );
  });

  if (payload.aiConfig !== undefined && payload.aiConfig !== null) {
    validateBackupAiConfig(payload.aiConfig, `${path}.aiConfig`);
  }

  if (
    payload.clientPreferences !== undefined &&
    payload.clientPreferences !== null
  ) {
    const preferences = requireObject(
      payload.clientPreferences,
      `${path}.clientPreferences`,
    );
    if (preferences.theme !== undefined && preferences.theme !== null) {
      requireEnum(preferences.theme, `${path}.clientPreferences.theme`, [
        'light',
        'dark',
        'system',
      ] as const);
    }
  }

  return payload as unknown as BackupPayload;
}

function validateReadingProgress(
  value: unknown,
  chapterId: string,
  chapterPath: string,
) {
  if (value === undefined || value === null) {
    return;
  }

  const progressPath = `${chapterPath}.readingProgress`;
  const progress = requireObject(value, progressPath);
  requireNonEmptyString(progress.id, `${progressPath}.id`, MAX_ID_LENGTH);
  const progressChapterId = requireNonEmptyString(
    progress.chapterId,
    `${progressPath}.chapterId`,
    MAX_ID_LENGTH,
  );
  if (progressChapterId !== chapterId) {
    fail(`${progressPath}.chapterId`, 'must match its parent chapter id');
  }
  requireFiniteNumber(
    progress.scrollPosition,
    `${progressPath}.scrollPosition`,
    0,
    MAX_SCROLL_POSITION,
  );
  requireFiniteNumber(
    progress.percentage,
    `${progressPath}.percentage`,
    0,
    100,
  );
  requireInteger(
    progress.readingSeconds,
    `${progressPath}.readingSeconds`,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  optionalDateLike(progress.updatedAt, `${progressPath}.updatedAt`);
}

function validateChunks(value: unknown, chapterPath: string) {
  if (value === undefined) {
    return;
  }

  const chunks = requireArray(
    value,
    `${chapterPath}.chunks`,
    MAX_BACKUP_COLLECTION_LENGTH,
  );
  const chunkIndexes = new Set<number>();
  chunks.forEach((entry, index) => {
    const chunkPath = `${chapterPath}.chunks[${index}]`;
    const chunk = requireObject(entry, chunkPath);
    const chunkIndex = requireInteger(
      chunk.chunkIndex,
      `${chunkPath}.chunkIndex`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (chunkIndexes.has(chunkIndex)) {
      fail(`${chunkPath}.chunkIndex`, 'must be unique within its chapter');
    }
    chunkIndexes.add(chunkIndex);
    requireString(
      chunk.content,
      `${chunkPath}.content`,
      MAX_CHAPTER_CONTENT_LENGTH,
    );
    requireInteger(
      chunk.charCount,
      `${chunkPath}.charCount`,
      0,
      MAX_CHAPTER_CONTENT_LENGTH,
    );
  });
}

function validateBackupAiConfig(value: unknown, path: string): BackupAiConfig {
  const config = requireObject(value, path);
  requireNonEmptyString(config.id, `${path}.id`, MAX_ID_LENGTH);
  validateAiRuntimeConfig(
    {
      mode: config.mode,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.model !== undefined ? { model: config.model } : {}),
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(config.embeddingProvider !== undefined
        ? { embeddingProvider: config.embeddingProvider }
        : {}),
      ...(config.embeddingModel !== undefined
        ? { embeddingModel: config.embeddingModel }
        : {}),
      ...(config.ragSourceCount !== undefined
        ? { ragSourceCount: config.ragSourceCount }
        : {}),
      ...(config.ragContextChars !== undefined
        ? { ragContextChars: config.ragContextChars }
        : {}),
      ...(config.ragExcerptChars !== undefined
        ? { ragExcerptChars: config.ragExcerptChars }
        : {}),
    },
    false,
  );
  optionalDateLike(config.updatedAt, `${path}.updatedAt`);
  return config as unknown as BackupAiConfig;
}

function requireObject(value: unknown, path: string): PlainObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as PlainObject;
}

function requireArray(
  value: unknown,
  path: string,
  maxLength: number,
): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, 'must be an array');
  }
  if (value.length > maxLength) {
    fail(path, `must contain at most ${maxLength} items`);
  }
  return value;
}

function requireAtLeastOneKey(value: PlainObject, path: string) {
  if (Object.keys(value).length === 0) {
    fail(path, 'must include at least one field');
  }
}

function rejectUnknownKeys(
  value: PlainObject,
  allowedKeys: readonly string[],
  path: string,
) {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) {
    fail(`${path}.${unknownKey}`, 'is not supported');
  }
}

function requireString(value: unknown, path: string, maxLength: number) {
  if (typeof value !== 'string') {
    fail(path, 'must be a string');
  }
  if (value.length > maxLength) {
    fail(path, `must contain at most ${maxLength} characters`);
  }
  return value;
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  maxLength: number,
) {
  const stringValue = requireString(value, path, maxLength).trim();
  if (!stringValue) {
    fail(path, 'must not be empty');
  }
  return stringValue;
}

function optionalString(
  value: unknown,
  path: string,
  maxLength: number,
  requireNonEmpty = false,
) {
  if (value === undefined) {
    return;
  }
  if (requireNonEmpty) {
    requireNonEmptyString(value, path, maxLength);
    return;
  }
  requireString(value, path, maxLength);
}

function optionalNullableString(
  value: unknown,
  path: string,
  maxLength: number,
) {
  if (value === undefined || value === null) {
    return;
  }
  requireString(value, path, maxLength);
}

function requireBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') {
    fail(path, 'must be a boolean');
  }
}

function optionalBoolean(value: unknown, path: string) {
  if (value !== undefined) {
    requireBoolean(value, path);
  }
}

function requireFiniteNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'must be a finite number');
  }
  if (value < min || value > max) {
    fail(path, `must be between ${min} and ${max}`);
  }
  return value;
}

function optionalFiniteNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
) {
  if (value !== undefined) {
    requireFiniteNumber(value, path, min, max);
  }
}

function requireInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
) {
  const numberValue = requireFiniteNumber(value, path, min, max);
  if (!Number.isInteger(numberValue)) {
    fail(path, 'must be an integer');
  }
  return numberValue;
}

function optionalInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
) {
  if (value !== undefined) {
    requireInteger(value, path, min, max);
  }
}

function requireEnum<T extends string>(
  value: unknown,
  path: string,
  allowedValues: readonly T[],
): T {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    fail(path, `must be one of: ${allowedValues.join(', ')}`);
  }
  return value as T;
}

function requireHttpUrl(value: string, path: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    fail(path, 'must be a valid HTTP(S) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail(path, 'must use http or https');
  }
}

function requireDateString(value: unknown, path: string) {
  if (typeof value !== 'string' || !isValidDate(value)) {
    fail(path, 'must be a valid date string');
  }
}

function requireDateLike(value: unknown, path: string) {
  if (!(value instanceof Date) && typeof value !== 'string') {
    fail(path, 'must be a valid date');
  }
  if (!isValidDate(value)) {
    fail(path, 'must be a valid date');
  }
}

function optionalDateLike(value: unknown, path: string) {
  if (value !== undefined && value !== null) {
    requireDateLike(value, path);
  }
}

function isValidDate(value: string | Date) {
  return !Number.isNaN(new Date(value).getTime());
}

function fail(path: string, message: string): never {
  throw new BadRequestException(`Invalid request: ${path} ${message}`);
}
