/**
 * Helpers para llamadas directas a la API desde tests E2E.
 * Uso: setup/teardown de datos de prueba sin pasar por la UI.
 */

export const API_URL  = process.env['API_URL']  ?? 'http://localhost:3001'
export const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3000'

export const DEMO_EMAIL    = 'admin@demo.nexor.co'
export const DEMO_PASSWORD = 'Admin123!'
export const B_EMAIL       = 'admin@empresa-b.nexor.co'
export const B_PASSWORD    = 'AdminB456!'
export const SUPER_EMAIL   = 'super@nexor.co'
export const SUPER_PASSWORD = 'SuperAdmin123!'

// ── Auth helpers ────────────────────────────────────────────────────────────

export interface LoginResult {
  token:        string
  refreshToken: string
  user: {
    id:       string
    tenantId: string
    role:     string
    name:     string
    branchId: string | null
    tenant:   { id: string; name: string; slug: string }
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<LoginResult>
}

// ── Request factory ─────────────────────────────────────────────────────────

export function api(token: string) {
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  })

  return {
    get: (path: string) =>
      fetch(`${API_URL}${path}`, { headers: headers() }),

    post: async <T = unknown>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${API_URL}${path}`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`POST ${path} → ${res.status}: ${text}`)
      }
      return res.json() as Promise<T>
    },

    put: async <T = unknown>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${API_URL}${path}`, {
        method:  'PUT',
        headers: headers(),
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`PUT ${path} → ${res.status}: ${text}`)
      }
      return res.json() as Promise<T>
    },

    putStatus: async (path: string, body: unknown): Promise<number> => {
      const res = await fetch(`${API_URL}${path}`, {
        method:  'PUT',
        headers: headers(),
        body:    JSON.stringify(body),
      })
      return res.status
    },

    patch: async <T = unknown>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${API_URL}${path}`, {
        method:  'PATCH',
        headers: headers(),
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`PATCH ${path} → ${res.status}: ${text}`)
      }
      return res.json() as Promise<T>
    },

    patchStatus: async (path: string, body: unknown): Promise<number> => {
      const res = await fetch(`${API_URL}${path}`, {
        method:  'PATCH',
        headers: headers(),
        body:    JSON.stringify(body),
      })
      return res.status
    },

    delete: (path: string) =>
      fetch(`${API_URL}${path}`, { method: 'DELETE', headers: headers() }),

    deleteStatus: async (path: string): Promise<number> => {
      const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers: headers() })
      return res.status
    },

    getStatus: async (path: string): Promise<number> => {
      const res = await fetch(`${API_URL}${path}`, { headers: headers() })
      return res.status
    },
  }
}
