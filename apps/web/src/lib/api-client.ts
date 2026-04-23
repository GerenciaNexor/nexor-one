import { useAuthStore } from '@/store/auth'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  // Token expirado o invalido — limpiar sesion y redirigir a login
  if (res.status === 401) {
    useAuthStore.getState().clearAuth()
    if (typeof window !== 'undefined') {
      window.location.replace('/login')
    }
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string }
    const err = Object.assign(new Error(body.error ?? 'Error desconocido'), {
      statusCode: res.status,
      code: body.code,
    })
    throw err
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiClient = {
  get:    <T>(path: string)                  => request<T>(path),
  post:   <T>(path: string, body: unknown)   => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)   => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => request<T>(path, { method: 'DELETE' }),
}
