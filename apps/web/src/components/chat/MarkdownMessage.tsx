'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  // Tablas
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-50 text-slate-600">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
  ),
  tr: ({ children }) => <tr className="hover:bg-slate-50/60">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2">{children}</td>,

  // Texto
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // Listas
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,

  // Código
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    return isBlock ? (
      <pre className="my-2 overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-800">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
        {children}
      </code>
    )
  },

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-slate-300 pl-3 text-slate-500 italic">
      {children}
    </blockquote>
  ),
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}
