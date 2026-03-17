'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AppShell } from '@/components/layout/AppShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)

  useEffect(() => {
    if (hasHydrated && !token) {
      router.replace('/login')
    }
  }, [hasHydrated, token, router])

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    )
  }

  if (!token) return null

  return <AppShell>{children}</AppShell>
}
