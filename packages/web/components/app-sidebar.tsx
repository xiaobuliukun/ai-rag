"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, ChevronRight, FileText, Home, Search, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/useStore"

// Mock data for sidebar
const mockBooks = [
  {
    id: "book-1",
    title: "React Deep Dive",
    chapters: [
      { id: "c1", title: "Introduction", fileName: "01-intro.md" },
      { id: "c2", title: "Virtual DOM", fileName: "02-vdom.md" },
      { id: "c3", title: "Reconciliation", fileName: "03-reconciliation.md" },
    ]
  },
  {
    id: "book-2",
    title: "Next.js Mastery",
    chapters: [
      { id: "c1", title: "App Router", fileName: "01-app-router.md" },
      { id: "c2", title: "Server Components", fileName: "02-rsc.md" },
    ]
  }
]

export function AppSidebar() {
  const pathname = usePathname()
  const { isSidebarOpen } = useStore()
  const [expandedBooks, setExpandedBooks] = React.useState<string[]>([])

  const toggleBook = (bookId: string) => {
    setExpandedBooks(prev => 
      prev.includes(bookId) 
        ? prev.filter(id => id !== bookId) 
        : [...prev, bookId]
    )
  }

  if (!isSidebarOpen) return null

  return (
    <aside className="w-64 border-r bg-card h-screen fixed left-0 top-0 flex flex-col z-40 transition-transform duration-300">
      <div className="p-4 border-b flex items-center gap-2 font-bold text-xl text-primary">
        <BookOpen className="w-6 h-6" />
        <span>Juejin Flow</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Main Navigation */}
        <div className="space-y-1">
          <Link 
            href="/" 
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/10 transition-colors",
              pathname === "/" ? "bg-accent/20 text-accent font-medium" : "text-muted-foreground"
            )}
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/10 transition-colors text-muted-foreground text-left">
            <Search className="w-4 h-4" />
            Search
          </button>
          <Link 
            href="/settings" 
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/10 transition-colors",
              pathname === "/settings" ? "bg-accent/20 text-accent font-medium" : "text-muted-foreground"
            )}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </div>

        {/* Books Tree */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-3 uppercase tracking-wider">
            Library
          </h3>
          <div className="space-y-1">
            {mockBooks.map((book) => (
              <div key={book.id}>
                <button
                  onClick={() => toggleBook(book.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/10 transition-colors text-sm font-medium text-foreground"
                >
                  <span className="truncate">{book.title}</span>
                  <ChevronRight 
                    className={cn(
                      "w-4 h-4 transition-transform text-muted-foreground",
                      expandedBooks.includes(book.id) && "rotate-90"
                    )} 
                  />
                </button>
                
                {expandedBooks.includes(book.id) && (
                  <div className="ml-4 mt-1 space-y-1 border-l pl-2 border-border">
                    {book.chapters.map((chapter) => (
                      <Link
                        key={chapter.id}
                        href={`/book/${book.id}/${chapter.id}`}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/10 transition-colors text-sm",
                          pathname === `/book/${book.id}/${chapter.id}` 
                            ? "text-accent bg-accent/10 font-medium" 
                            : "text-muted-foreground"
                        )}
                      >
                        <FileText className="w-3 h-3" />
                        <span className="truncate">{chapter.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Footer / User Info */}
      <div className="p-4 border-t text-xs text-muted-foreground">
        <p>Local User</p>
        <p className="opacity-50">v0.1.0</p>
      </div>
    </aside>
  )
}
