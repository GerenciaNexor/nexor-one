'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { useAuthStore } from '@/store/auth'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { ProjectSelect } from '@/components/proyectos/ProjectSelect'
import { processFile } from './InvoiceUploadModal'

type Kind = 'purchase' | 'sale'
interface Branch { id: string; name: string }

const MAX_BATCH = 10 // demo (coincide con QUICK_BATCH_MAX del backend)

/**
 * HU-212 — Carga de VARIAS facturas por foto (lote). Comprime en el navegador, sube el lote y lo procesa
 * en segundo plano (cola). Dos modos: esperar en pantalla con progreso, o cerrar y recibir aviso.
 */
export function BatchUploadModal({ kind, onClose, onReady, onBackground }: {
  kind:  Kind
  onClose: () => void
  onReady: (batchId: string) => void   // modo esperar: al terminar, abrir la revisión del lote
  onBackground: () => void             // modo segundo plano: cerrar (se avisará al terminar)
}) {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'
  const isSale      = kind === 'sale'
  const inputRef    = useRef<HTMLInputElement>(null)

  const [files, setFiles]     = useState<File[]>([])
  const [mode, setMode]       = useState<'wait' | 'background'>('wait')
  const [branchId, setBranchId] = useState(isOperative ? (user?.branchId ?? '') : '')
  const [projectId, setProjectId] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null)

  useEffect(() => {
    apiClient.get<{ data: Branch[] }>('/v1/quick/branches').then((r) => { setBranches(r.data); if (r.data.length === 1 && !isOperative) setBranchId(r.data[0]!.id) }).catch(() => {})
  }, [isOperative])

  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_BATCH))
    if (inputRef.current) inputRef.current.value = ''
  }
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i))

  async function submit() {
    if (files.length === 0) { setErr('Selecciona al menos una imagen.'); return }
    setBusy(true); setErr(null)
    try {
      const images = await Promise.all(files.map(async (f) => {
        const proc = await processFile(f)
        return { fileName: f.name, base64: proc.base64, mime: proc.mime }
      }))
      const res = await apiClient.post<{ data: { batchId: string; total: number } }>('/v1/quick/invoices/batch', {
        kind, mode, branchId: branchId || undefined, projectId: projectId || undefined, images,
      })
      const batchId = res.data.batchId
      if (mode === 'background') { onBackground(); return }
      // Modo esperar: sondear el progreso hasta que el lote termine.
      setProgress({ processed: 0, total: res.data.total })
      const poll = async (): Promise<void> => {
        const b = await apiClient.get<{ data: { status: string; processed: number; total: number } }>(`/v1/quick/invoices/batch/${batchId}`)
        setProgress({ processed: b.data.processed, total: b.data.total })
        if (b.data.status === 'processing') { setTimeout(() => { void poll() }, 2000); return }
        onReady(batchId)
      }
      void poll()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo procesar el lote.')
      setBusy(false); setProgress(null)
    }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const accent = isSale ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cargar varias facturas — {isSale ? 'Ventas' : 'Compras'} rápidas</h3>
            <button onClick={onClose} aria-label="Cerrar" disabled={busy} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">✕</button>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Hasta {MAX_BATCH} imágenes por lote. La lectura propone los datos; tú revisas o aceptas al terminar.</p>

          {progress ? (
            /* ── Progreso (modo esperar) ── */
            <div className="py-10 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Procesando lote… {progress.processed} de {progress.total}</p>
              <p className="mt-1 text-xs text-slate-400">Leyendo las facturas con IA. No cierres esta ventana.</p>
              <div className="mx-auto mt-3 h-2 w-56 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          ) : (
            <>
              {/* Selección de archivos */}
              <div className="mt-4">
                <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={(e) => addFiles(e.target.files)} className="hidden" />
                <button type="button" onClick={() => inputRef.current?.click()} disabled={files.length >= MAX_BATCH}
                  className="w-full rounded-xl border-2 border-dashed border-slate-300 py-5 text-sm font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">
                  📷 Seleccionar imágenes {files.length > 0 ? `(${files.length}/${MAX_BATCH})` : ''}
                </button>
                {files.length > 0 && (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
                        <span className="truncate text-slate-700 dark:text-slate-200">{f.name}</span>
                        <button onClick={() => removeFile(i)} aria-label="Quitar" className="shrink-0 text-slate-400 hover:text-red-500">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sucursal (no operativo) */}
              {!isOperative && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sucursal (para afectar inventario, opcional)</label>
                  <SearchableSelect value={branchId} onChange={setBranchId} className={inp} placeholder="Sin sucursal"
                    options={[{ value: '', label: 'Sin sucursal' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
                </div>
              )}

              {/* Proyecto por defecto para todo el lote (opcional): cae en cada factura al registrarla */}
              <div className="mt-3">
                <ProjectSelect value={projectId} onChange={setProjectId} className={inp} label="Proyecto por defecto del lote (opcional)" />
              </div>

              {/* Modo */}
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">¿Cómo quieres procesarlo?</p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                    <input type="radio" name="mode" checked={mode === 'wait'} onChange={() => setMode('wait')} className="mt-0.5" />
                    <span><b className="text-slate-800 dark:text-slate-100">Esperar aquí</b><span className="block text-xs text-slate-500">Ves el progreso y al terminar revisas el lote.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                    <input type="radio" name="mode" checked={mode === 'background'} onChange={() => setMode('background')} className="mt-0.5" />
                    <span><b className="text-slate-800 dark:text-slate-100">En segundo plano</b><span className="block text-xs text-slate-500">Cierras y te avisamos (plataforma y WhatsApp) cuando esté listo.</span></span>
                  </label>
                </div>
              </div>

              {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

              <div className="mt-5 flex justify-end gap-2">
                <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">Cancelar</button>
                <button onClick={() => void submit()} disabled={busy || files.length === 0} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${accent}`}>
                  {busy ? 'Subiendo…' : `Procesar ${files.length || ''} factura${files.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
