import {
  buildFtsQuery,
  createHighlightedSnippet,
  normalizeSearchText,
  parseVectorMetadata,
} from './content-index.service';

describe('ContentIndexService helpers', () => {
  it('normalizes CJK text into searchable unicode tokens', () => {
    expect(normalizeSearchText('测试 React  Hooks')).toBe('测 试 react hooks');
  });

  it('builds FTS queries for mixed Chinese and Latin terms', () => {
    expect(buildFtsQuery('测试 React')).toBe('react* "测" "试"');
    expect(buildFtsQuery('测试 React', 'or')).toBe('react* OR "测" OR "试"');
  });

  it('escapes snippets before adding highlight markup', () => {
    const snippet = createHighlightedSnippet(
      '<script>React</script> hooks share stateful logic.',
      'React',
    );

    expect(snippet.text).toContain('<script>React</script>');
    expect(snippet.html).toContain(
      '&lt;script&gt;<mark>React</mark>&lt;/script&gt;',
    );
    expect(snippet.html).not.toContain('<script>');
  });

  it('parses vector metadata for embedding index freshness checks', () => {
    expect(
      parseVectorMetadata(
        JSON.stringify({
          embeddingProvider: 'openai-compatible',
          embeddingModel: 'text-embedding-3-small',
        }),
      ),
    ).toEqual({
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'text-embedding-3-small',
    });

    expect(parseVectorMetadata('bad-json')).toEqual({});
  });
});
