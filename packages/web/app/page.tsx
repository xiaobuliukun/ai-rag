import { BookCard } from "@/components/book-card"
import { Book } from "@/types"
import { Search } from "lucide-react"

// Mock Data
const books: Book[] = [
  {
    id: "book-1",
    title: "React Deep Dive",
    path: "/books/react-deep-dive",
    lastRead: new Date("2023-10-25"),
    totalChapters: 20,
    readChapters: 5,
  },
  {
    id: "book-2",
    title: "Next.js Mastery: The Complete Guide to App Router",
    path: "/books/nextjs-mastery",
    lastRead: new Date("2023-10-20"),
    totalChapters: 15,
    readChapters: 0,
  },
  {
    id: "book-3",
    title: "Effective TypeScript",
    path: "/books/effective-typescript",
    lastRead: new Date("2023-10-15"),
    totalChapters: 10,
    readChapters: 10,
  },
  {
    id: "book-4",
    title: "Refactoring UI",
    path: "/books/refactoring-ui",
    lastRead: new Date("2023-10-01"),
    totalChapters: 8,
    readChapters: 2,
  },
]

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Library</h1>
          <p className="text-muted-foreground mt-1">
            Manage and read your local documentation collection.
          </p>
        </div>
        
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search books..." 
            className="w-full h-10 pl-9 pr-4 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  )
}
