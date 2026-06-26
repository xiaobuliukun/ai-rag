"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { AIAssistantPanel } from "@/components/ai-assistant-panel"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const {
    isSidebarOpen,
    toggleSidebar,
    isAIPanelOpen,
    toggleAIPanel,
    aiPanelWidth,
  } = useStore()
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main Content Wrapper */}
      <div 
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-in-out",
          isSidebarOpen ? "ml-64" : "ml-0",
        )}
        style={{ marginRight: isAIPanelOpen ? aiPanelWidth : 0 }}
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
              <span className="text-sm font-medium hidden sm:inline">{t("nav.aiAssistant")}</span>
              {isAIPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>

      <AIAssistantPanel />
    </div>
  )
}
