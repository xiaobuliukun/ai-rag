import {
  normalizeMarkdownImageSrc,
  resolveMarkdownImageSrc,
} from './markdown-images';

describe('markdown image helpers', () => {
  it('normalizes remote and local image paths', () => {
    expect(normalizeMarkdownImageSrc('//p3-juejin.byteimg.com/demo.png')).toBe(
      'https://p3-juejin.byteimg.com/demo.png',
    );
    expect(
      normalizeMarkdownImageSrc(' images/cover%20shot.png?raw=1#preview '),
    ).toBe('images/cover shot.png');
  });

  it('resolves chapter-relative local images to book asset URLs', () => {
    expect(
      resolveMarkdownImageSrc(
        '../assets/cover%20shot.png',
        'book-1',
        'chapters/day-1/intro.md',
      ),
    ).toBe(
      'http://localhost:3001/api/assets/books/book-1/files?path=chapters%2Fassets%2Fcover+shot.png',
    );
  });

  it('leaves remote URLs untouched', () => {
    expect(resolveMarkdownImageSrc('https://example.com/a.png', 'book-1')).toBe(
      'https://example.com/a.png',
    );
  });
});
