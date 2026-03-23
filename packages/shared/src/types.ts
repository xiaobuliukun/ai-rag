export interface Book {
  id: string
  title: string
  path: string
  lastRead: Date
  coverImage?: string
  chapters?: Chapter[]
  totalChapters?: number
  readChapters?: number
}

export interface Chapter {
  id: string
  bookId: string
  title: string
  fileName: string
  content?: string
  isRead: boolean
  progress: number
  children?: Chapter[]
}

export interface SidebarConfig {
  books: Book[]
}

export interface ScanRequest {
  path: string
}

export interface ScanResponse {
  success: boolean
  message: string
}

export interface UpdateProgressRequest {
  progress: number
}
