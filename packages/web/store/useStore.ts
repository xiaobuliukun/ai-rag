import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiContext, AiRuntimeConfig } from '@/types'
import type { Locale } from '@/lib/i18n'

interface AppState {
  isSidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
  openSidebar: () => void
  
  isAIPanelOpen: boolean
  toggleAIPanel: () => void
  
  fontSize: number
  setFontSize: (size: number) => void

  lineHeight: number
  setLineHeight: (lineHeight: number) => void

  locale: Locale
  setLocale: (locale: Locale) => void

  aiConfig: AiRuntimeConfig
  setAIConfig: (config: Partial<AiRuntimeConfig>) => void

  readingContext?: AiContext
  setReadingContext: (context?: AiContext) => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      closeSidebar: () => set({ isSidebarOpen: false }),
      openSidebar: () => set({ isSidebarOpen: true }),

      isAIPanelOpen: false,
      toggleAIPanel: () =>
        set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),

      fontSize: 17,
      setFontSize: (size) => set({ fontSize: size }),

      lineHeight: 1.8,
      setLineHeight: (lineHeight) => set({ lineHeight }),

      locale: "zh-CN",
      setLocale: (locale) => set({ locale }),

      aiConfig: {
        mode: "local",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "",
      },
      setAIConfig: (config) =>
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            ...config,
          },
        })),

      readingContext: undefined,
      setReadingContext: (context) => set({ readingContext: context }),
    }),
    {
      name: "juejin-flow-preferences",
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        locale: state.locale,
        aiConfig: state.aiConfig,
      }),
    },
  ),
)
