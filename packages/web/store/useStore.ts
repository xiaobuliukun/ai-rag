import { create } from 'zustand'

interface AppState {
  isSidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
  openSidebar: () => void
  
  isAIPanelOpen: boolean
  toggleAIPanel: () => void
  
  fontSize: number
  setFontSize: (size: number) => void
}

export const useStore = create<AppState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  closeSidebar: () => set({ isSidebarOpen: false }),
  openSidebar: () => set({ isSidebarOpen: true }),
  
  isAIPanelOpen: false,
  toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),
  
  fontSize: 16,
  setFontSize: (size) => set({ fontSize: size }),
}))
