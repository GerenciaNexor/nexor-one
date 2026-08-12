'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

interface ChannelCfg { enabled: boolean; respond: boolean; schedule: boolean }
interface Behavior {
  whatsapp: ChannelCfg
  gmail:    ChannelCfg
  hours:    { mode: '24_7' | 'business'; start?: string; end?: string }
}
interface BranchRow { id: string; name: string; hasOwn: boolean; settings: Behavior }
interface Data { default: Behavior; branches: BranchRow[] }

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export default function AiSettingsPage() {
  const [data, setData]       = useState<Data | null>(null)
  const [scope, setScope]     = useState<'default' | 'branches'>('default')
  const [selected, setSelected] = useState<string[]>([])
  const [cfg, setCfg]         = useState<Behavior | null>(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  function load() {
    apiClient.get<Data>('/v1/agent-settings').then((d) => { setData(d); setCfg(clone(d.default)) }).catch(() => setData({ default: fallback(), branches: [] }))
  }
  useEffect(() => { load() }, [])

  // Al elegir "una sucursal específica" concreta, precargar su configuración actual.
  function pickScope(s: 'default' | 'branches') {
    setScope(s); setMsg(null)
    if (s === 'default' && data) setCfg(clone(data.default))
  }
  function toggleBranch(id: string) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // Si queda exactamente una seleccionada, precargar su config para editar sobre ella.
      if (next.length === 1 && data) { const b = data.branches.find((x) => x.id === next[0]); if (b) setCfg(clone(b.settings)) }
      return next
    })
  }

  async function save() {
    if (!cfg) return
    setMsg(null)
    if (scope === 'branches' && selected.length === 0) { setMsg({ ok: false, text: 'Selecciona al menos una sucursal.' }); return }
    if (cfg.hours.mode === 'business' && (!cfg.hours.start || !cfg.hours.end)) { setMsg({ ok: false, text: 'Indica el horario de inicio y fin.' }); return }
    setSaving(true)
    try {
      await apiClient.put('/v1/agent-settings', { branchIds: scope === 'default' ? null : selected, settings: cfg })
      setMsg({ ok: true, text: scope === 'default' ? 'Configuración guardada para todas las sucursales.' : `Configuración guardada para ${selected.length} sucursal(es).` })
      load()
    } catch (e: unknown) {
      setMsg({ ok: false, text: (e as { message?: string }).message ?? 'No se pudo guardar.' })
    } finally { setSaving(false) }
  }

  if (!data || !cfg) return <div className="p-6"><div className="h-6 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-700" /></div>

  const setCh = (ch: 'whatsapp' | 'gmail', patch: Partial<ChannelCfg>) => setCfg((c) => c && ({ ...c, [ch]: { ...c[ch], ...patch } }))

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Configuración de IA</h1>
      <p className="mt-0.5 text-sm text-slate-500">Define cómo se comporta el asistente por sucursal: canales activos, si responde o solo notifica, si agenda citas y en qué horario. Los cambios rigen el comportamiento real del agente.</p>

      {/* ── Alcance: a qué sucursales aplicar ── */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">¿A qué aplicar esta configuración?</p>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="radio" checked={scope === 'default'} onChange={() => pickScope('default')} />
            Predeterminado — todas las sucursales (y las que no tengan config propia)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="radio" checked={scope === 'branches'} onChange={() => pickScope('branches')} />
            Sucursales específicas
          </label>
        </div>
        {scope === 'branches' && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
            {data.branches.length === 0 && <span className="text-xs text-slate-400">No hay sucursales.</span>}
            {data.branches.map((b) => (
              <button key={b.id} onClick={() => toggleBranch(b.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${selected.includes(b.id) ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                {b.name}{b.hasOwn ? ' •' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Canales ── */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(['whatsapp', 'gmail'] as const).map((ch) => (
          <div key={ch} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ch === 'whatsapp' ? 'WhatsApp' : 'Gmail'}</span>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={cfg[ch].enabled} onChange={(e) => setCh(ch, { enabled: e.target.checked })} />
                Canal activo
              </label>
            </div>
            <div className={`mt-3 space-y-2 text-sm ${cfg[ch].enabled ? '' : 'opacity-40'}`}>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <input type="checkbox" disabled={!cfg[ch].enabled} checked={cfg[ch].respond} onChange={(e) => setCh(ch, { respond: e.target.checked, ...(e.target.checked ? {} : { schedule: false }) })} />
                Responde a los clientes {cfg[ch].enabled && !cfg[ch].respond && <span className="text-xs text-amber-600">(solo lee y notifica)</span>}
              </label>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <input type="checkbox" disabled={!cfg[ch].enabled || !cfg[ch].respond} checked={cfg[ch].schedule} onChange={(e) => setCh(ch, { schedule: e.target.checked })} />
                Puede agendar citas
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* ── Horario ── */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Horario en que responde</span>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-2"><input type="radio" checked={cfg.hours.mode === '24_7'} onChange={() => setCfg((c) => c && ({ ...c, hours: { mode: '24_7' } }))} /> 24/7 (siempre)</label>
          <label className="flex items-center gap-2"><input type="radio" checked={cfg.hours.mode === 'business'} onChange={() => setCfg((c) => c && ({ ...c, hours: { mode: 'business', start: c.hours.start ?? '08:00', end: c.hours.end ?? '18:00' } }))} /> Horario laboral</label>
          {cfg.hours.mode === 'business' && (
            <div className="flex items-center gap-2">
              <input type="time" value={cfg.hours.start ?? '08:00'} onChange={(e) => setCfg((c) => c && ({ ...c, hours: { ...c.hours, start: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" />
              <span className="text-slate-400">a</span>
              <input type="time" value={cfg.hours.end ?? '18:00'} onChange={(e) => setCfg((c) => c && ({ ...c, hours: { ...c.hours, end: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" />
            </div>
          )}
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Fuera del horario, el agente no responde: lee el mensaje y notifica al negocio.</p>
      </div>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}

      <div className="mt-5">
        <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  )
}

function fallback(): Behavior {
  return { whatsapp: { enabled: true, respond: true, schedule: true }, gmail: { enabled: true, respond: true, schedule: true }, hours: { mode: '24_7' } }
}
