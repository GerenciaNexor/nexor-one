'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { PlatformShell } from '@/components/platform/PlatformShell'

/**
 * Zona de PLATAFORMA (equipo NEXOR) — HU-137. Aislada del panel de cliente.
 * Solo accesible con una identidad de plataforma (platform_admin). Un usuario de tenant
 * (o sin sesión) es redirigido al login de plataforma; además el backend responde 403 en
 * /v1/admin/* a cualquier token que no sea de plataforma.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router        = useRouter()
  const token         = useAuthStore((s) => s.token)
  const platformAdmin = useAuthStore((s) => s.platformAdmin)
  const hasHydrated   = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (hasHydrated && (!token || !platformAdmin)) {
      router.replace('/platform-login')
    }
  }, [hasHydrated, token, platformAdmin, router])

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500 dark:border-slate-700 dark:border-t-violet-500" />
      </div>
    )
  }

  if (!token || !platformAdmin) return null

  return <PlatformShell>{children}</PlatformShell>
}
