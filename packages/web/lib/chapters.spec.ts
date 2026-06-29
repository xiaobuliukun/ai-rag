import type { Chapter } from "@/types";
import { buildChapterTree } from "./chapters";

function chapter(partial: Partial<Chapter> & Pick<Chapter, "id" | "fileName">): Chapter {
  return {
    bookId: "book-1",
    title: partial.id,
    orderIndex: 0,
    isRead: false,
    progress: 0,
    ...partial,
  };
}

describe("chapter tree helpers", () => {
  it("groups chapters by their relative folder path", () => {
    const tree = buildChapterTree([
      chapter({ id: "intro", title: "Intro", fileName: "01-intro.md" }),
      chapter({
        id: "hooks-state",
        title: "useState",
        fileName: "02-hooks/01-use-state.md",
      }),
      chapter({
        id: "hooks-effect",
        title: "useEffect",
        fileName: "02-hooks/02-use-effect.md",
      }),
    ]);

    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({
      id: "intro",
      title: "Intro",
      chapter: expect.objectContaining({ id: "intro" }),
    });
    expect(tree[1]).toMatchObject({
      id: "folder:02-hooks",
      title: "hooks",
      children: [
        expect.objectContaining({ id: "hooks-state", title: "useState" }),
        expect.objectContaining({ id: "hooks-effect", title: "useEffect" }),
      ],
    });
  });
});
