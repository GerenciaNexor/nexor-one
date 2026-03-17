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
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
