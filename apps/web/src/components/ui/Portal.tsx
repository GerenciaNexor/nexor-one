'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renderiza children directamente en <body> para que modales y overlays
 * no sean afectados por overflow, transform o z-index de contenedores padre.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
