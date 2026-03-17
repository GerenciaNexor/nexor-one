'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LoginUser } from '@/lib/auth-api'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: LoginUser | null
  /** true una vez que Zustand termino de leer localStorage (necesario para Next.js SSR). */
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void
  setAuth: (token: string, refreshToken: string, user: LoginUser) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      clearAuth: () => set({ token: null, refreshToken: null, user: null }),
    }),
    {
      name: 'nexor-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
