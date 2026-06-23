import { chunkMarkdownContent } from './chunking';

describe('chunkMarkdownContent', () => {
  it('returns no chunks for empty content', () => {
    expect(chunkMarkdownContent('   ')).toEqual([]);
  });

  it('keeps chunk indexes and character counts stable', () => {
    const chunks = chunkMarkdownContent(
      [
        '# Intro',
        'React hooks share stateful logic.',
        'Effects run after rendering.',
      ].join('\n\n'),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      charCount: chunks[0].content.length,
    });
    expect(chunks[0].content).toContain('React hooks');
  });

  it('splits long content into multiple chunks', () => {
    const chunks = chunkMarkdownContent(
      `${'A'.repeat(1300)}\n\n${'B'.repeat(800)}`,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
  });
});
