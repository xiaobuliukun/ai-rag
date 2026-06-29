"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { AIAssistantPanel } from "@/components/ai-assistant-panel"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { ChevronRight, Menu, PanelRightClose, PanelRightOpen } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import type { AiContext } from "@/types"

type BreadcrumbItem = {
  label: string
  href?: string
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const {
    isSidebarOpen,
    toggleSidebar,
    closeSidebar,
    isAIPanelOpen,
    toggleAIPanel,
    aiPanelWidth,
    readingContext,
  } = useStore()
  const { t } = useI18n()
  const pathname = usePathname()
  const [isDesktop, setIsDesktop] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(mediaQuery.matches)

    update()
    mediaQuery.addEventListener("change", update)
    return () => mediaQuery.removeEventListener("change", update)
  }, [])

  const shouldReserveAiSpace = isDesktop && isAIPanelOpen
  const breadcrumbs = React.useMemo(
    () => buildBreadcrumbs(pathname, readingContext, t),
    [pathname, readingContext, t],
  )
  const isHome = pathname === "/"
  const locksMainScroll = isHome || pathname.startsWith("/management")

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {isSidebarOpen && !isDesktop && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
          aria-label="Close navigation"
        />
      )}

      {/* Sidebar */}
      <AppSidebar />

      <div 
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col duration-300 [transition-property:margin-left,margin-right] [transition-timing-function:cubic-bezier(0.25,1,0.5,1)]",
          isSidebarOpen ? "lg:ml-72" : "ml-0",
        )}
        style={{ marginRight: shouldReserveAiSpace ? aiPanelWidth : 0 }}
      >
        <header className="topbar-surface sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b px-5 backdrop-blur">
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleSidebar}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              aria-label="Toggle navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Breadcrumbs items={breadcrumbs} />
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleAIPanel}
              className="flex items-center gap-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              aria-label={t("nav.aiAssistant")}
            >
              <span className="text-sm font-medium hidden sm:inline">{t("nav.aiAssistant")}</span>
              {isAIPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main
          className={cn(
            "main-canvas min-h-0 flex-1 p-5",
            locksMainScroll ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {children}
        </main>
      </div>

      <AIAssistantPanel />
    </div>
  )
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground sm:flex"
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="max-w-36 truncate rounded-sm px-1.5 py-1 transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="max-w-52 truncate px-1.5 py-1 font-medium text-foreground">
                {item.label}
              </span>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

function buildBreadcrumbs(
  pathname: string,
  readingContext: AiContext | undefined,
  t: ReturnType<typeof useI18n>["t"],
): BreadcrumbItem[] {
  const home = { label: t("nav.home"), href: "/" }

  if (pathname === "/") {
    return [{ label: t("nav.home") }]
  }

  if (pathname.startsWith("/search")) {
    return [home, { label: t("nav.search") }]
  }

  if (pathname.startsWith("/management")) {
    return [home, { label: t("nav.management") }]
  }

  if (pathname.startsWith("/settings")) {
    return [home, { label: t("nav.settings") }]
  }

  const [, section, bookId, chapterId] = pathname.split("/")

  if (section === "book" && bookId) {
    const isCurrentBook = readingContext?.bookId === bookId
    const isCurrentChapter = readingContext?.chapterId === chapterId
    const bookLabel =
      isCurrentBook && readingContext?.bookTitle
        ? readingContext.bookTitle
        : t("nav.library")
    const items: BreadcrumbItem[] = [
      home,
      {
        label: bookLabel,
        href: chapterId ? `/book/${bookId}` : undefined,
      },
    ]

    if (chapterId) {
      items.push({
        label:
          isCurrentChapter && readingContext?.chapterTitle
            ? readingContext.chapterTitle
            : t("book.chapters"),
      })
    }

    return items
  }

  return [home]
}
