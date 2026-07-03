const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export interface LoginUser {
  id: string
  email: string
  name: string
  role: string
  /** Módulo principal del usuario (AREA_MANAGER/OPERATIVE). null para admins transversales. */
  module: string | null
  tenantId: string
  branchId: string | null
  tenant: { id: string; name: string; slug: string }
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: LoginUser
}

/** Error enriquecido con statusCode para distinguir 401 de 403 en la UI. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new ApiRequestError('El servicio no esta disponible. Intenta nuevamente.', 0)
  }

  if (!res.ok) {
    let body: { error?: string; code?: string } = {}
    try {
      body = await res.json()
    } catch {
      // respuesta sin cuerpo JSON — ignorar
    }
    throw new ApiRequestError(body.error ?? 'Error desconocido', res.status, body.code)
  }

  return res.json() as Promise<LoginResponse>
}

// ─── Plataforma (equipo NEXOR) — HU-137 ─────────────────────────────────────

export interface PlatformAdminInfo {
  id: string
  email: string
  name: string
}
export interface PlatformLoginResponse {
  token: string
  admin: PlatformAdminInfo
}

/** Login del equipo NEXOR. Emite un JWT de plataforma (sin tenantId). */
export async function loginPlatformRequest(
  email: string,
  password: string,
): Promise<PlatformLoginResponse> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/v1/platform/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    })
  } catch {
    throw new ApiRequestError('El servicio no esta disponible. Intenta nuevamente.', 0)
  }
  if (!res.ok) {
    let body: { error?: string; code?: string } = {}
    try { body = await res.json() } catch { /* sin cuerpo */ }
    throw new ApiRequestError(body.error ?? 'Error desconocido', res.status, body.code)
  }
  return res.json() as Promise<PlatformLoginResponse>
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('nexor-auth') : null
  let token: string | null = null
  if (stored) {
    try {
      token = (JSON.parse(stored) as { state?: { token?: string } }).state?.token ?? null
    } catch {
      // ignorar
    }
  }

  await fetch(`${API_URL}/v1/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {
    // El logout local siempre procede aunque falle la peticion
  })
}
