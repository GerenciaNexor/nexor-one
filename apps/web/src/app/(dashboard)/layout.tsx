'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AppShell } from '@/components/layout/AppShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const token         = useAuthStore((s) => s.token)
  const platformAdmin = useAuthStore((s) => s.platformAdmin)
  const impersonation = useAuthStore((s) => s.impersonation)
  const hasHydrated   = useAuthStore((s) => s._hasHydrated)

  // HU-137 — el panel de cliente es solo para sesiones de tenant. Una identidad de
  // plataforma NO ve aquí ningún dato de negocio: se le redirige a su consola, salvo
  // cuando está impersonando (soporte), que es el único camino auditado a un tenant.
  const isPlatformOutsideImpersonation = !!platformAdmin && !impersonation?.active

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) { router.replace('/login'); return }
    if (isPlatformOutsideImpersonation) { router.replace('/platform') }
  }, [hasHydrated, token, isPlatformOutsideImpersonation, router])

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    )
  }

  if (!token || isPlatformOutsideImpersonation) return null

  return (
    <AppShell>
      <div key={pathname} className="page-enter">
        {children}
      </div>
    </AppShell>
  )
}
