import { getBookProgress, sortChapters } from "./models";
import type { Book, Chapter } from "@moxu/shared";
import { describe, expect, it } from "@jest/globals";

describe("library models", () => {
  it("uses chapter completion when chapter details are available", () => {
    expect(
      getBookProgress({
        chapters: [
          { isRead: true },
          { isRead: false }
        ] as Book["chapters"],
        totalChapters: 2,
        readChapters: 1
      })
    ).toEqual({ total: 2, read: 1, percentage: 50 });
  });

  it("sorts chapters by order and then filename", () => {
    const chapters = [
      { id: "b", orderIndex: 2, fileName: "02-b.md" },
      { id: "c", orderIndex: 1, fileName: "02-c.md" },
      { id: "a", orderIndex: 1, fileName: "01-a.md" }
    ];

    expect(sortChapters(chapters as Chapter[]).map((chapter) => chapter.id)).toEqual([
      "a",
      "c",
      "b"
    ]);
  });
});
