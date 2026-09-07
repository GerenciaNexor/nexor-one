import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NEXOR — Gestión Empresarial con IA',
  description: 'Sistema SaaS multi-tenant con agentes de IA para ventas, compras, inventario y agendamiento.',
}

// HU-198 — `viewport-fit=cover` habilita las safe-areas de iOS (notch/isla/barra de gestos) vía
// env(safe-area-inset-*). NO se fija maximum-scale para no romper el zoom por accesibilidad; el zoom
// automático al enfocar inputs se evita con font-size ≥ 16px en móvil (ver globals.css).
export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
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
