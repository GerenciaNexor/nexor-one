'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

/**
 * Layout del grupo (auth) — rutas publicas: /login
 * Si el usuario ya tiene sesion activa, lo redirige al dashboard.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (hasHydrated && token) {
      router.replace('/dashboard')
    }
  }, [hasHydrated, token, router])

  // Esperar hidratacion para no mostrar login a un usuario ya autenticado
  if (!hasHydrated || token) return null

  return <>{children}</>
}
