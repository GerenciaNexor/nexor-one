'use client'

import { useEffect, useState } from 'react'
import { Portal } from './Portal'

interface ToastProps {
  message: string
  success: boolean
  onDismiss: () => void
  duration?: number
}

export function Toast({ message, success, onDismiss, duration = 4500 }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 200)
    }, duration)
    return () => clearTimeout(id)
  }, [duration, onDismiss])

  return (
    <Portal>
      <div
        className={[
          'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200',
          success ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
          visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        ].join(' ')}
      >
        {success ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        {message}
      </div>
    </Portal>
  )
}

/** Hook para gestionar el ciclo de vida de un toast. */
export function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function show(msg: string, ok: boolean) {
    setToast({ msg, ok })
  }

  function dismiss() {
    setToast(null)
  }

  const element = toast ? (
    <Toast message={toast.msg} success={toast.ok} onDismiss={dismiss} />
  ) : null

  return { show, element }
}
