import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiContext, AiRuntimeConfig } from '@/types'
import type { Locale } from '@/lib/i18n'

const DEFAULT_AI_PANEL_WIDTH = 384
const MIN_AI_PANEL_WIDTH = 320
const MAX_AI_PANEL_WIDTH = 640

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

interface AppState {
  isSidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
  openSidebar: () => void
  
  isAIPanelOpen: boolean
  toggleAIPanel: () => void

  aiPanelWidth: number
  setAIPanelWidth: (width: number) => void
  
  fontSize: number
  setFontSize: (size: number) => void

  lineHeight: number
  setLineHeight: (lineHeight: number) => void

  colorTemperature: number
  setColorTemperature: (value: number) => void

  pageBrightness: number
  setPageBrightness: (value: number) => void

  autoBrightness: boolean
  setAutoBrightness: (enabled: boolean) => void

  paperTexture: boolean
  setPaperTexture: (enabled: boolean) => void

  readingReminderMinutes: number
  setReadingReminderMinutes: (minutes: number) => void

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

      aiPanelWidth: DEFAULT_AI_PANEL_WIDTH,
      setAIPanelWidth: (width) =>
        set({
          aiPanelWidth: clamp(
            Math.round(width),
            MIN_AI_PANEL_WIDTH,
            MAX_AI_PANEL_WIDTH,
          ),
        }),

      fontSize: 17,
      setFontSize: (size) => set({ fontSize: size }),

      lineHeight: 1.8,
      setLineHeight: (lineHeight) => set({ lineHeight }),

      colorTemperature: 52,
      setColorTemperature: (value) => set({ colorTemperature: value }),

      pageBrightness: 100,
      setPageBrightness: (value) => set({ pageBrightness: value }),

      autoBrightness: false,
      setAutoBrightness: (enabled) => set({ autoBrightness: enabled }),

      paperTexture: true,
      setPaperTexture: (enabled) => set({ paperTexture: enabled }),

      readingReminderMinutes: 30,
      setReadingReminderMinutes: (minutes) =>
        set({ readingReminderMinutes: minutes }),

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
        aiPanelWidth: state.aiPanelWidth,
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        colorTemperature: state.colorTemperature,
        pageBrightness: state.pageBrightness,
        autoBrightness: state.autoBrightness,
        paperTexture: state.paperTexture,
        readingReminderMinutes: state.readingReminderMinutes,
        locale: state.locale,
        aiConfig: state.aiConfig,
      }),
    },
  ),
)
