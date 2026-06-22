'use client'

import { useEffect, useRef, useState } from 'react'

type Msg = { from: 'client' | 'agent'; text: string }

const MESSAGES: Msg[] = [
  { from: 'client', text: 'Hola, ¿tienen disponible el producto X y a qué precio?' },
  { from: 'agent', text: '¡Hola! Sí, tenemos 24 unidades en stock. El precio es 45.000 por unidad. ¿Te preparo una cotización?' },
  { from: 'client', text: 'Sí, por favor, para 10 unidades.' },
  { from: 'agent', text: 'Listo. Cotización COT-1042 creada por 10 unidades. Te la envío en PDF ahora mismo.' },
]

/** Conversación de WhatsApp que se "escribe" sola cuando entra en pantalla. */
export function ChatDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setVisibleCount(MESSAGES.length)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        observer.disconnect()

        let t = 300
        MESSAGES.forEach((_, i) => {
          timers.push(setTimeout(() => setTyping(true), t))
          t += 1100
          timers.push(
            setTimeout(() => {
              setTyping(false)
              setVisibleCount(i + 1)
            }, t),
          )
          t += 500
        })
      },
      { threshold: 0.35 },
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div ref={ref} className="rounded-2xl border border-white/10 bg-[#0b1020]/80 p-5 shadow-2xl">
      {/* Cabecera */}
      <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
        </span>
        <span className="text-sm font-medium text-slate-300">WhatsApp · Cliente</span>
      </div>

      {/* Mensajes */}
      <div className="flex min-h-[16rem] flex-col justify-end space-y-3 text-sm">
        {MESSAGES.slice(0, visibleCount).map((m, i) =>
          m.from === 'client' ? (
            <div
              key={i}
              className="ml-auto max-w-[80%] animate-fade-up rounded-2xl rounded-br-sm bg-slate-700/60 px-4 py-2.5 text-slate-100"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="max-w-[85%] animate-fade-up rounded-2xl rounded-bl-sm bg-gradient-to-br from-purple-600/80 to-pink-600/70 px-4 py-2.5 text-white"
            >
              {m.text}
            </div>
          ),
        )}

        {/* Indicador de "escribiendo" */}
        {typing && (
          <div className="flex max-w-[40%] items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white/10 px-4 py-3">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-slate-300"
                style={{ animation: 'nx-blink 1s ease-in-out infinite', animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
