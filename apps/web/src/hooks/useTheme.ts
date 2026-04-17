'use client'

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'nexor-theme'

/**
 * Hook para gestionar el tema claro/oscuro.
 *
 * - Lee el estado REAL del DOM (`<html class="dark">`) como fuente de verdad,
 *   en lugar del estado React, para evitar stale-closure bugs.
 * - Un MutationObserver mantiene el estado React sincronizado con el DOM
 *   (cubre el caso donde el script anti-flash ya puso la clase antes de hidratar).
 * - `toggle` siempre interroga el DOM antes de cambiar, nunca la variable
 *   de React — así no importa cuántos re-renders intermedios ocurran.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const html = document.documentElement

    // Sincronizar estado React con la clase real que ya existe en el DOM
    setTheme(html.classList.contains('dark') ? 'dark' : 'light')

    // Observar cambios externos en la clase de <html>
    const observer = new MutationObserver(() => {
      setTheme(html.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  const toggle = useCallback(() => {
    // Leer del DOM — nunca del estado React (evita stale closure)
    const isDark = document.documentElement.classList.contains('dark')
    const next: Theme = isDark ? 'light' : 'dark'

    document.documentElement.classList.toggle('dark', !isDark)
    localStorage.setItem(STORAGE_KEY, next)
    // setTheme se dispara automáticamente desde el MutationObserver,
    // pero lo llamamos también aquí para respuesta inmediata sin esperar al observer
    setTheme(next)
  }, [])

  return { theme, toggle }
}
