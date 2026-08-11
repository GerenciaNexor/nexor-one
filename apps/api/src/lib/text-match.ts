/**
 * Matching de texto tolerante (tildes/plural/parcial) para cruzar descripciones contra un catálogo
 * SIN llamar a la API. Reutilizado por el OCR de facturas (HU-191) para decidir si un ítem leído
 * "está o no está" en inventario. Misma lógica que el matching del agente de atención (HU-185).
 */

/** Minúsculas + sin acentos. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Singulariza una palabra en español (monitores→monitor, cables→cable). */
export function singular(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s'))  return w.slice(0, -1)
  return w
}

/** Palabras normalizadas + singularizadas de un texto (mín. 2 chars), para matching tolerante. */
export function searchWords(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2).map(singular)
}

/** ¿Coinciden dos palabras? exacta, o una prefijo/incluida en la otra (mín. 3 chars para evitar ruido). */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 3) return false
  return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)
}

export interface CatalogProduct { id: string; name: string; sku?: string | null }

/**
 * Encuentra el producto del catálogo que mejor coincide con `query` (descripción de un ítem de la
 * factura). Exige que al menos la MITAD de las palabras de la consulta coincidan (y ≥1), para no
 * emparejar por ruido. Devuelve `null` si ninguno supera el umbral → el ítem se trata como "no está".
 */
export function matchProductByName(query: string, products: CatalogProduct[]): CatalogProduct | null {
  const qWords = searchWords(query)
  if (qWords.length === 0) return null

  let best: { product: CatalogProduct; hits: number; nameLen: number } | null = null
  for (const p of products) {
    const pWords = searchWords(`${p.name} ${p.sku ?? ''}`)
    if (pWords.length === 0) continue
    const hits = qWords.filter((q) => pWords.some((pw) => wordsMatch(q, pw))).length
    if (hits === 0) continue
    if (!best || hits > best.hits || (hits === best.hits && p.name.length < best.nameLen)) {
      best = { product: p, hits, nameLen: p.name.length }
    }
  }

  if (!best) return null
  // Umbral: al menos la mitad de las palabras de la consulta deben coincidir (mín. 1).
  if (best.hits < Math.max(1, Math.ceil(qWords.length / 2))) return null
  return best.product
}
