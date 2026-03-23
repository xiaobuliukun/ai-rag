"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { isSidebarOpen, toggleSidebar, isAIPanelOpen, toggleAIPanel } = useStore()

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main Content Wrapper */}
      <div 
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-in-out",
          isSidebarOpen ? "ml-64" : "ml-0",
          isAIPanelOpen ? "mr-80" : "mr-0" // Reserved for AI Panel
        )}
      >
        {/* Header / Toolbar (optional, usually per page, but global toggle is useful) */}
        <header className="h-14 border-b flex items-center justify-between px-4 sticky top-0 bg-background/80 backdrop-blur z-30">
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleSidebar}
              className="p-2 hover:bg-accent/10 rounded-md text-muted-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Breadcrumbs could go here */}
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleAIPanel}
              className="p-2 hover:bg-accent/10 rounded-md text-muted-foreground flex items-center gap-2"
            >
              <span className="text-sm font-medium hidden sm:inline">AI Assistant</span>
              {isAIPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* AI Panel (Placeholder) */}
      <aside 
        className={cn(
          "w-80 border-l bg-card h-screen fixed right-0 top-0 flex flex-col z-40 transition-transform duration-300",
          isAIPanelOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="p-4 border-b font-bold text-lg">AI Assistant</div>
        <div className="p-4 text-muted-foreground text-sm">
          Select text to ask AI...
        </div>
      </aside>
    </div>
  )
}
