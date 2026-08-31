import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

interface MathMarkdownProps {
  content: string
  className?: string
}

/**
 * Preprocesses markdown text from LLM to normalize LaTeX expressions.
 * - Replaces \[ ... \] with $$ ... $$
 * - Replaces \( ... \) with $ ... $
 * - Cleans up escaped dollar signs if any
 */
function normalizeLatex(text: string): string {
  if (!text) return ''
  
  let formatted = text
    // Replace \[ ... \] block math with $$ ... $$
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, eq) => `\n\n$$\n${eq.trim()}\n$$\n\n`)
    // Replace \( ... \) inline math with $ ... $
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, eq) => `$${eq.trim()}$`)
    // Fix double-escaped LaTeX backslashes like \\frac -> \frac if needed
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
  
  return formatted
}

export function MathMarkdown({ content, className = '' }: MathMarkdownProps) {
  const normalized = normalizeLatex(content)

  return (
    <div className={`math-markdown-content ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        skipHtml
      >
        {normalized}
      </ReactMarkdown>
    </div>
  )
}
