'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useAuthStore } from '@/store/auth'

/**
 * Sincroniza el usuario autenticado con el scope de Sentry.
 * Debe montarse dentro de AppShell, despues de la hidratacion del store.
 *
 * Cuando el usuario cierra sesion, limpia el contexto de Sentry.
 */
export function SentryUserContext() {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id })
      Sentry.setTag('tenant_id', user.tenantId)
    } else {
      Sentry.setUser(null)
      Sentry.setTag('tenant_id', undefined)
    }
  }, [user])

  return null
}
