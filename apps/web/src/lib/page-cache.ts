/**
 * Caché en memoria para datos de páginas.
 * Persiste durante la sesión del navegador (vive en el módulo JS).
 * Permite mostrar datos anteriores instantáneamente mientras se refresca en background.
 */
const store = new Map<string, unknown>()

export function getCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

export function setCache(key: string, value: unknown): void {
  store.set(key, value)
}

export function clearCache(key: string): void {
  store.delete(key)
}
