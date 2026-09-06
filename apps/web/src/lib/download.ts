import { useAuthStore } from '@/store/auth'

/**
 * Descarga un archivo de la API autenticando con el Bearer del store (apiClient no maneja blobs).
 * Usa un enlace temporal con object URL. Lanza si la respuesta no es OK.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token  = useAuthStore.getState().token
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
  const res = await fetch(`${apiUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('No se pudo descargar el archivo')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Construye un querystring a partir de un objeto, omitiendo valores vacíos/undefined. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}
