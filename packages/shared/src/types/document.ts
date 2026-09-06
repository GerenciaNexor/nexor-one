/**
 * Tipos de documento de identificación más usados en Colombia (DIAN) para terceros
 * (proveedores/clientes). El código se guarda; la etiqueta se muestra en la UI.
 */
export const DOCUMENT_TYPES = [
  { code: 'NIT',  label: 'NIT — Número de Identificación Tributaria' },
  { code: 'CC',   label: 'CC — Cédula de ciudadanía' },
  { code: 'CE',   label: 'CE — Cédula de extranjería' },
  { code: 'TI',   label: 'TI — Tarjeta de identidad' },
  { code: 'PP',   label: 'PP — Pasaporte' },
  { code: 'PEP',  label: 'PEP — Permiso Especial de Permanencia' },
  { code: 'PPT',  label: 'PPT — Permiso por Protección Temporal' },
  { code: 'NUIP', label: 'NUIP — Número Único de Identificación Personal' },
  { code: 'RC',   label: 'RC — Registro civil' },
  { code: 'OTRO', label: 'Otro' },
] as const

export type DocumentTypeCode = (typeof DOCUMENT_TYPES)[number]['code']

/** Los códigos válidos, para validación (Zod, plantillas, etc.). */
export const DOCUMENT_TYPE_CODES = DOCUMENT_TYPES.map((d) => d.code) as DocumentTypeCode[]

/** Etiqueta legible para un código (o el código mismo si es desconocido). */
export function documentTypeLabel(code: string | null | undefined): string {
  if (!code) return ''
  return DOCUMENT_TYPES.find((d) => d.code === code)?.label ?? code
}
