"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderOpen,
  Home,
  LibraryBig,
  Search,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { Book } from "@/types";
import { getBooks } from "@/lib/api";
import { buildChapterTree, ChapterTreeNode } from "@/lib/chapters";
import { useI18n } from "@/lib/i18n";

const LIBRARY_REFRESH_EVENT = "library:refresh";

export function AppSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { isSidebarOpen } = useStore();
  const [books, setBooks] = React.useState<Book[]>([]);
  const [expandedBooks, setExpandedBooks] = React.useState<string[]>([]);

  const loadBooks = React.useCallback(async () => {
    try {
      setBooks(await getBooks());
    } catch {
      setBooks([]);
    }
  }, []);

  React.useEffect(() => {
    loadBooks();

    window.addEventListener(LIBRARY_REFRESH_EVENT, loadBooks);
    return () => window.removeEventListener(LIBRARY_REFRESH_EVENT, loadBooks);
  }, [loadBooks]);

  React.useEffect(() => {
    const activeBookId = pathname.match(/^\/book\/([^/]+)/)?.[1];
    if (activeBookId) {
      setExpandedBooks((prev) =>
        prev.includes(activeBookId) ? prev : [...prev, activeBookId],
      );
    }
  }, [pathname]);

  const toggleBook = (bookId: string) => {
    setExpandedBooks((prev) =>
      prev.includes(bookId)
        ? prev.filter((id) => id !== bookId)
        : [...prev, bookId],
    );
  };

  return (
    <aside
      aria-hidden={!isSidebarOpen}
      className={cn(
        "atelier-sidebar fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r shadow-2xl transition-transform duration-300 [transition-timing-function:cubic-bezier(0.25,1,0.5,1)] lg:shadow-none",
        isSidebarOpen
          ? "translate-x-0"
          : "pointer-events-none -translate-x-full",
      )}
    >
      <div className="atelier-sidebar-brand border-b p-5">
        <div className="flex items-center gap-3">
          <div className="atelier-brand-mark flex h-10 w-10 items-center justify-center rounded-lg">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight">
              墨序
            </div>
            <div className="text-xs font-medium">
              私人阅读档案
            </div>
          </div>
        </div>
      </div>

      <nav className="flex shrink-0 flex-col gap-1 px-3 py-4" aria-label="Main navigation">
        <Link
          href="/"
          className={cn(
            "sidebar-nav-link",
            pathname === "/" && "is-active",
          )}
        >
          <Home className="h-4 w-4" />
          <span>{t("nav.home")}</span>
        </Link>
        <Link
          href="/search"
          className={cn(
            "sidebar-nav-link",
            pathname === "/search" && "is-active",
          )}
        >
          <Search className="h-4 w-4" />
          <span>{t("nav.search")}</span>
        </Link>
        <Link
          href="/management"
          className={cn(
            "sidebar-nav-link",
            pathname === "/management" && "is-active",
          )}
        >
          <LibraryBig className="h-4 w-4" />
          <span>{t("nav.management")}</span>
        </Link>
        <Link
          href="/settings"
          className={cn(
            "sidebar-nav-link",
            pathname === "/settings" && "is-active",
          )}
        >
          <Settings className="h-4 w-4" />
          <span>{t("nav.settings")}</span>
        </Link>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-4">
        <div className="mb-3 flex shrink-0 items-center justify-between px-2">
          <h3 className="text-xs font-semibold uppercase">
            {t("nav.library")}
          </h3>
          <span className="atelier-count rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {books.length}
          </span>
        </div>
        <div className="scrollbar-soft min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
          {books.map((book) => (
            <div key={book.id}>
              <button
                onClick={() => toggleBook(book.id)}
                className="sidebar-book-button flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              >
                <span className="truncate">{book.title}</span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform",
                    expandedBooks.includes(book.id) && "rotate-90",
                  )}
                />
              </button>

              {expandedBooks.includes(book.id) && (
                <div className="sidebar-chapter-tree ml-4 mt-1 space-y-1 border-l pl-2">
                  {buildChapterTree(book.chapters ?? []).map((node) => (
                    <SidebarChapterNode
                      key={node.id}
                      bookId={book.id}
                      node={node}
                      pathname={pathname}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="atelier-sidebar-footer shrink-0 border-t p-4 text-xs">
        <p>{t("nav.localUser")}</p>
        <p className="opacity-50">v0.1.0</p>
      </div>
    </aside>
  );
}

function SidebarChapterNode({
  bookId,
  node,
  pathname,
}: {
  bookId: string;
  node: ChapterTreeNode;
  pathname: string;
}) {
  if (!node.chapter) {
    return (
      <div className="space-y-1">
        <div className="sidebar-folder flex items-center gap-2 px-3 py-1.5 text-xs font-medium">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{node.title}</span>
        </div>
        <div className="ml-3 space-y-1 border-l pl-2">
          {node.children.map((child) => (
            <SidebarChapterNode
              key={child.id}
              bookId={bookId}
              node={child}
              pathname={pathname}
            />
          ))}
        </div>
      </div>
    );
  }

  const chapter = node.chapter;
  const href = `/book/${bookId}/${chapter.id}`;

  return (
    <Link
      href={href}
      className={cn(
        "sidebar-chapter-link flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
        pathname === href && "is-active",
      )}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate">{chapter.title}</span>
    </Link>
  );
}
