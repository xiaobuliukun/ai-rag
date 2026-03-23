import { MarkdownReader } from "@/components/markdown-reader"
import { notFound } from "next/navigation"

// Mock content generator
function getMockContent(chapterId: string) {
  return `
# Chapter ${chapterId}

## Introduction

This is a **simulated** markdown content for chapter ${chapterId}.
It demonstrates how the *reader* renders various markdown elements.

## Code Example

Here is some TypeScript code:

\`\`\`typescript
function greeting(name: string) {
  console.log(\`Hello, \${name}!\`);
}

greeting("Juejin Flow User");
\`\`\`

## Features

- **Immersive Reading**: Clean typography and distraction-free layout.
- **Syntax Highlighting**: Beautiful code blocks.
- **Responsive**: Works on all devices.

> "Reading is to the mind what exercise is to the body." — Joseph Addison

## Conclusion

This is the end of the chapter.
  `
}

// In a real app, we would fetch data based on params
// For now, we simulate async data fetching
export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>
}) {
  const { bookId, chapterId } = await params
  
  // Simulate fetch
  const content = getMockContent(chapterId)
  
  if (!content) {
    notFound()
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-4xl mx-auto px-6">
        <div className="mb-8 pt-6 border-b pb-4">
          <div className="text-sm text-muted-foreground mb-2">Book ID: {bookId}</div>
          <h1 className="text-3xl font-bold tracking-tight">Chapter {chapterId}</h1>
        </div>
        
        <MarkdownReader content={content} />
        
        <div className="mt-12 py-8 border-t flex justify-between">
          <button className="px-4 py-2 border rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
            Previous Chapter
          </button>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
            Next Chapter
          </button>
        </div>
      </div>
    </div>
  )
}
