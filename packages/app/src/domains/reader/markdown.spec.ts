import { parseMarkdown, resolveMarkdownImageSrc } from "./markdown";
import { describe, expect, it } from "@jest/globals";

describe("mobile markdown", () => {
  it("parses the supported block types", () => {
    expect(
      parseMarkdown(
        [
          "# Heading",
          "",
          "Paragraph text",
          "",
          "- first",
          "- second",
          "",
          "> quote",
          "",
          "```ts",
          "const ok = true;",
          "```",
          "",
          "![cover](images/cover.png)"
        ].join("\n")
      ).map((block) => block.type)
    ).toEqual(["heading", "paragraph", "list", "quote", "code", "image"]);
  });

  it("resolves relative images through the authenticated asset endpoint", () => {
    expect(
      resolveMarkdownImageSrc(
        "../images/cover.png",
        "http://127.0.0.1:3001/api",
        "book-1",
        "chapters/intro.md"
      )
    ).toBe(
      "http://127.0.0.1:3001/api/assets/books/book-1/files?path=images%2Fcover.png"
    );
  });
});
