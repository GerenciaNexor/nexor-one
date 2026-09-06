'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Ajusta la ALTURA de un elemento al área realmente visible (visualViewport) en móvil.
 *
 * En iOS/Android el teclado virtual reduce el `visualViewport` pero NO el layout viewport (100vh /
 * 100dvh / h-screen no cambian). Resultado: los inputs al fondo de una pantalla alta quedan DEBAJO
 * del teclado y no se pueden ver ni tocar cómodamente. Este hook fija la altura del contenedor a la
 * altura visible real, de modo que al abrir el teclado la pantalla se encoge y el input sube por
 * encima de él. En pantallas grandes (≥ breakpoint) no hace nada: manda el CSS (h-screen, etc.).
 *
 * Escucha resize/scroll del visualViewport (teclado, barra de direcciones) y orientationchange.
 */
export function useVisualViewportHeight(ref: RefObject<HTMLElement | null>, breakpoint = 1024): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const apply = () => {
      const el = ref.current
      if (!el) return
      // Solo móvil/tablet: donde aparece el teclado virtual. En desktop dejamos que mande el CSS.
      if (window.innerWidth >= breakpoint) { el.style.height = ''; return }
      el.style.height = `${Math.round(vv.height)}px`
    }

    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [ref, breakpoint])
}
