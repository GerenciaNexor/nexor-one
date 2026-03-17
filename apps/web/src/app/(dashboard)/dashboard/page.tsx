'use client'

import { useAuthStore } from '@/store/auth'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900">
        Bienvenido, {user?.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Selecciona un modulo en la barra lateral para comenzar.
      </p>
    </div>
  )
}
