import Link from "next/link"
import { FileText } from "lucide-react"

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  
  // Mock chapters
  const chapters = [
    { id: "c1", title: "Introduction" },
    { id: "c2", title: "Getting Started" },
    { id: "c3", title: "Advanced Concepts" },
  ]

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Book Overview: {bookId}</h1>
        <p className="text-muted-foreground text-lg">
          Select a chapter to start reading.
        </p>
      </div>

      <div className="space-y-4">
        {chapters.map((chapter) => (
          <Link 
            key={chapter.id} 
            href={`/book/${bookId}/${chapter.id}`}
            className="block p-4 border rounded-lg hover:bg-accent/10 hover:border-accent transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-accent group-hover:bg-accent/20 transition-colors">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="font-medium text-lg">{chapter.title}</span>
              </div>
              <span className="text-sm text-muted-foreground">Start Reading &rarr;</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
