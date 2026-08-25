'use client'

import { useState } from 'react'

// HU-203 — Formulario público "Cuéntanos tu proyecto" (NEXOR IT). Envía a /v1/contact (sin auth) y
// confirma al visitante en pantalla. Usa fetch crudo (no el apiClient, que inyecta token y redirige).
const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export function ContactForm() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone]     = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus]   = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError]     = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Completa tu nombre, correo y el mensaje.')
      return
    }
    setStatus('sending')
    try {
      const res = await fetch(`${API_URL}/v1/contact`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name: name.trim(), email: email.trim(),
          company: company.trim() || undefined, phone: phone.trim() || undefined,
          message: message.trim(), kind: 'nexor_it',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'No se pudo enviar. Intenta de nuevo.')
      }
      setStatus('sent')
    } catch (err) {
      setStatus('idle')
      setError((err as { message?: string }).message ?? 'No se pudo enviar. Intenta de nuevo.')
    }
  }

  const inp = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-emerald-400/50 focus:bg-white/[0.07]'

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
          <svg className="h-6 w-6 text-emerald-300" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-white">¡Recibimos tu mensaje!</h3>
        <p className="mt-2 text-sm text-slate-300">Gracias por escribirnos. Nuestro equipo te contactará muy pronto para conversar sobre tu proyecto.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Tu nombre *" autoComplete="name" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder="Correo *" type="email" autoComplete="email" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={company} onChange={(e) => setCompany(e.target.value)} className={inp} placeholder="Empresa (opcional)" autoComplete="organization" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} placeholder="Teléfono / WhatsApp (opcional)" autoComplete="tel" />
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className={`${inp} resize-none`} placeholder="Cuéntanos tu proyecto: qué necesitas, qué problema quieres resolver… *" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={status === 'sending'}
        className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.01] disabled:opacity-60">
        {status === 'sending' ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      <p className="text-center text-xs text-slate-500">Te respondemos por correo. No compartimos tus datos con terceros.</p>
    </form>
  )
}
