'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LoginUser, PlatformAdminInfo } from '@/lib/auth-api'

/**
 * Dos identidades (HU-134/HU-137):
 *  · `user`          → sesión de CLIENTE (tenant). Panel de empresa en /dashboard.
 *  · `platformAdmin` → sesión de PLATAFORMA (equipo NEXOR). Consola en /platform.
 * Solo una está activa a la vez. La impersonación deja al platform_admin "actuando como"
 * un tenant: guarda el token de plataforma para poder volver.
 */
interface Impersonation {
  active: boolean
  tenantName: string
  platformToken: string
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: LoginUser | null
  platformAdmin: PlatformAdminInfo | null
  impersonation: Impersonation | null
  /** true una vez que Zustand termino de leer localStorage (necesario para Next.js SSR). */
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  setAuth: (token: string, refreshToken: string, user: LoginUser) => void
  setPlatformAuth: (token: string, admin: PlatformAdminInfo) => void
  clearAuth: () => void
  /** Entra en modo impersonación: guarda el token de plataforma y activa la sesión de tenant. */
  startImpersonation: (impToken: string, syntheticUser: LoginUser, tenantName: string) => void
  /** Sale de impersonación: restaura la sesión de plataforma. */
  stopImpersonation: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      platformAdmin: null,
      impersonation: null,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setAuth: (token, refreshToken, user) =>
        set({ token, refreshToken, user, platformAdmin: null, impersonation: null }),
      setPlatformAuth: (token, admin) =>
        set({ token, refreshToken: null, user: null, platformAdmin: admin, impersonation: null }),
      clearAuth: () =>
        set({ token: null, refreshToken: null, user: null, platformAdmin: null, impersonation: null }),
      startImpersonation: (impToken, syntheticUser, tenantName) => {
        const platformToken = get().token
        if (!platformToken) return
        set({
          token: impToken,
          user: syntheticUser,
          impersonation: { active: true, tenantName, platformToken },
        })
      },
      stopImpersonation: () => {
        const imp = get().impersonation
        if (!imp) return
        set({ token: imp.platformToken, user: null, impersonation: null })
      },
    }),
    {
      name: 'nexor-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
