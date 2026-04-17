import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NEXOR — Gestión Empresarial con IA',
  description: 'Sistema SaaS multi-tenant con agentes de IA para ventas, compras, inventario y agendamiento.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema ANTES de que React hidrate para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('nexor-theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s===null&&p)){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
