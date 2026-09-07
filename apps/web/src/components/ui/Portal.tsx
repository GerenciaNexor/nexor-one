'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renderiza children directamente en <body> para que modales y overlays
 * no sean afectados por overflow, transform o z-index de contenedores padre.
 *
 * HU-198 — Bloqueo de scroll del fondo (`lockScroll`, activo por defecto): mientras hay un modal
 * abierto se fija el <body> (position:fixed). Esto evita el bug clásico de iOS Safari en el que, al
 * enfocar un input dentro de un overlay `position:fixed`, el navegador desplaza el documento detrás
 * del overlay y deja ver el fondo en BLANCO. Con el body fijo, el foco se resuelve dentro del scroll
 * interno del propio modal. Es ref-contado (soporta modales anidados) y compensa el ancho del
 * scrollbar en desktop para no producir saltos. Los widgets NO modales (toasts, chat flotante) pasan
 * `lockScroll={false}`.
 */

let lockCount = 0
let savedScrollY = 0

function lockBodyScroll(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    const b = document.body
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    b.style.position = 'fixed'
    b.style.top = `-${savedScrollY}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.width = '100%'
    b.style.overflow = 'hidden'
    if (scrollbarWidth > 0) b.style.paddingRight = `${scrollbarWidth}px`
  }
  lockCount++
}

function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    const b = document.body
    b.style.position = ''
    b.style.top = ''
    b.style.left = ''
    b.style.right = ''
    b.style.width = ''
    b.style.overflow = ''
    b.style.paddingRight = ''
    window.scrollTo(0, savedScrollY)
  }
}

export function Portal({ children, lockScroll = true }: { children: React.ReactNode; lockScroll?: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!lockScroll) return
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [lockScroll])

  if (!mounted) return null
  return createPortal(children, document.body)
}
