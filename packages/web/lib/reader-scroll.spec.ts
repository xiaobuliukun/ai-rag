import {
  APP_SCROLL_CONTAINER_SELECTOR,
  buildBookmarkReaderHref,
  calculateReadingProgress,
  calculateScrollPercentage,
  calculateScrollTopFromPercentage,
  findAppScrollContainer,
  parseBookmarkPosition,
} from "./reader-scroll";

describe("reader scroll helpers", () => {
  it("calculates progress relative to the app scroll viewport", () => {
    const viewportTop = 56;
    const viewportHeight = 800;
    const contentHeight = 2000;

    expect(
      calculateReadingProgress({
        contentTop: 496,
        contentHeight,
        viewportTop,
        viewportHeight,
      }),
    ).toBe(0);
    expect(
      calculateReadingProgress({
        contentTop: -364,
        contentHeight,
        viewportTop,
        viewportHeight,
      }),
    ).toBe(50);
    expect(
      calculateReadingProgress({
        contentTop: -1224,
        contentHeight,
        viewportTop,
        viewportHeight,
      }),
    ).toBe(100);
  });

  it("finds the stable app scroll container", () => {
    const container = {} as HTMLElement;
    const querySelector = jest.fn(() => container);
    const root = { querySelector } as unknown as ParentNode;

    expect(findAppScrollContainer(root)).toBe(container);
    expect(querySelector).toHaveBeenCalledWith(APP_SCROLL_CONTAINER_SELECTOR);
  });

  it("converts bookmark percentages to and from the real scrollable height", () => {
    expect(
      calculateScrollPercentage({
        scrollTop: 600,
        scrollHeight: 2000,
        viewportHeight: 800,
      }),
    ).toBe(50);
    expect(
      calculateScrollTopFromPercentage({
        position: 50,
        scrollHeight: 2000,
        viewportHeight: 800,
      }),
    ).toBe(600);
    expect(
      calculateScrollTopFromPercentage({
        position: 120,
        scrollHeight: 2000,
        viewportHeight: 800,
      }),
    ).toBe(1200);
  });

  it("parses and serializes bookmark position query values safely", () => {
    expect(parseBookmarkPosition("42.4")).toBe(42);
    expect(parseBookmarkPosition(["81", "20"])).toBe(81);
    expect(parseBookmarkPosition("999")).toBe(100);
    expect(parseBookmarkPosition("bad")).toBeUndefined();
    expect(buildBookmarkReaderHref("book 1", "chapter/2", 37.6)).toBe(
      "/book/book%201/chapter%2F2?position=38",
    );
  });
});
