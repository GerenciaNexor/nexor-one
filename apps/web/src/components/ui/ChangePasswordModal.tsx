'use client'

import { useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { apiClient } from '@/lib/api-client'

/**
 * Modal de cambio de la PROPIA contraseña (self-service).
 * Disponible para CUALQUIER rol — no requiere ser admin (HU: cambiar mi contraseña).
 * Llama a PUT /v1/users/me/password, que verifica la contraseña actual en el backend.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (next.length < 8)  { setError('La nueva contraseña debe tener al menos 8 caracteres'); return }
    if (next !== confirm) { setError('Las contraseñas no coinciden'); return }
    setSaving(true)
    try {
      await apiClient.put('/v1/users/me/password', { currentPassword: current, newPassword: next })
      setDone(true)
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'No se pudo cambiar la contraseña')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cambiar contraseña</h2>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          {done ? (
            <div className="py-4 text-center">
              <p className="text-sm font-medium text-emerald-600">✓ Contraseña actualizada</p>
              <p className="mt-1 text-xs text-slate-400">Úsala la próxima vez que inicies sesión.</p>
              <button onClick={onClose} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Listo</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</div>}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Contraseña actual</label>
                <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Nueva contraseña</label>
                <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Confirmar nueva contraseña</label>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
                <button type="submit" disabled={saving || !current || !next} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Guardando…' : 'Cambiar contraseña'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Portal>
  )
}
