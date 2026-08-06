import Link from 'next/link'

/**
 * Documento legal. El contenido vive en `src/content/legal/*.ts` (texto plano, fácil de
 * reemplazar cuando el abogado entregue la versión final — sin tocar este componente ni las URLs).
 * `body` se escribe como texto normal: los párrafos se separan con una línea en blanco y las
 * líneas que empiezan con "- " se agrupan como viñetas.
 */
export interface LegalDoc {
  title:    string
  updated:  string
  intro?:   string
  sections: { heading: string; body: string }[]
}

const LEGAL_LINKS = [
  { href: '/privacidad',        label: 'Política de Privacidad' },
  { href: '/terminos',          label: 'Términos del Servicio' },
  { href: '/eliminacion-datos', label: 'Eliminación de datos' },
]

// Convierte el texto plano de `body` en párrafos y listas de viñetas.
function renderBody(body: string) {
  return body.trim().split(/\n\s*\n/).map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((l) => l.startsWith('- '))) {
      return (
        <ul key={i} className="my-3 list-disc space-y-1.5 pl-5 text-slate-300">
          {lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}
        </ul>
      )
    }
    return <p key={i} className="my-3 leading-relaxed text-slate-300">{block.trim()}</p>
  })
}

export function LegalLayout({ doc }: { doc: LegalDoc }) {
  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-200 antialiased">
      {/* Resplandor de fondo (coherente con la landing) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-purple-600/15 blur-[120px]" />
      </div>

      <div className="relative">
        {/* Navbar */}
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logos/icon-dark.png" alt="NEXOR ONE" className="h-8 w-auto object-contain" />
            <span className="font-wordmark text-xl font-semibold tracking-tight text-slate-100 [word-spacing:-0.2em]">nexor one</span>
          </Link>
          <Link href="/" className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-slate-100 backdrop-blur transition-colors hover:bg-white/10">
            Volver al inicio
          </Link>
        </header>

        {/* Documento */}
        <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
          <h1 className="font-wordmark bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">Última actualización: {doc.updated}</p>

          {doc.intro && <p className="mt-6 leading-relaxed text-slate-300">{doc.intro}</p>}

          <div className="mt-8 space-y-8">
            {doc.sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-lg font-semibold text-slate-100">{s.heading}</h2>
                {renderBody(s.body)}
              </section>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-8 text-center">
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              {LEGAL_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-slate-400 transition-colors hover:text-white">{l.label}</Link>
              ))}
              <a href="mailto:gerencia@nexor-one.com" className="text-slate-400 transition-colors hover:text-white">gerencia@nexor-one.com</a>
            </nav>
            <p className="text-xs text-slate-600">© {new Date().getFullYear()} NEXOR ONE SAS · Gestión empresarial con IA</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
