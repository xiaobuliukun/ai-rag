import type { Chapter } from "@/types";

export type ChapterTreeNode = {
  id: string;
  title: string;
  children: ChapterTreeNode[];
  chapter?: Chapter;
};

export function buildChapterTree(chapters: Chapter[]) {
  const root: ChapterTreeNode[] = [];
  const folders = new Map<string, ChapterTreeNode>();

  for (const chapter of chapters) {
    const parts = chapter.fileName.split("/").filter(Boolean);
    const folderParts = parts.slice(0, -1);
    let siblings = root;
    let currentPath = "";

    for (const folder of folderParts) {
      currentPath = currentPath ? `${currentPath}/${folder}` : folder;
      let node = folders.get(currentPath);

      if (!node) {
        node = {
          id: `folder:${currentPath}`,
          title: formatPathSegment(folder),
          children: [],
        };
        folders.set(currentPath, node);
        siblings.push(node);
      }

      siblings = node.children;
    }

    siblings.push({
      id: chapter.id,
      title: chapter.title,
      chapter,
      children: [],
    });
  }

  return root;
}

function formatPathSegment(segment: string) {
  const title = segment
    .replace(/\.[^.]+$/, "")
    .replace(/^\d+[-_.]\s*/, "")
    .replace(/[-_]+/g, " ")
    .trim();

  return title || segment;
}
