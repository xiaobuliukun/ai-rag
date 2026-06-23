const TARGET_CHUNK_LENGTH = 900;
const MAX_CHUNK_LENGTH = 1200;
const OVERLAP_LENGTH = 120;

export type ContentChunk = {
  chunkIndex: number;
  content: string;
  charCount: number;
};

export function chunkMarkdownContent(content: string): ContentChunk[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_LENGTH) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...sliceLongText(paragraph));
      continue;
    }

    if (current && `${current}\n\n${paragraph}`.length > TARGET_CHUNK_LENGTH) {
      chunks.push(current);
      current = withOverlap(current, paragraph);
      continue;
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((chunk, index) => ({
    chunkIndex: index,
    content: chunk,
    charCount: chunk.length,
  }));
}

function sliceLongText(text: string) {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += TARGET_CHUNK_LENGTH) {
    chunks.push(text.slice(start, start + MAX_CHUNK_LENGTH).trim());
  }
  return chunks.filter(Boolean);
}

function withOverlap(previous: string, next: string) {
  const overlap = previous.slice(-OVERLAP_LENGTH).trim();
  return overlap ? `${overlap}\n\n${next}` : next;
}
