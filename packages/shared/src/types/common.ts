/** Modulos de negocio disponibles en V1. */
export type ModuleName = 'ARI' | 'NIRA' | 'KIRA' | 'AGENDA' | 'VERA'

/** Canales de comunicacion soportados. */
export type ChannelType = 'WHATSAPP' | 'GMAIL' | 'MANUAL'

/** Envoltorio estandar para respuestas exitosas de la API. */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

/** Envoltorio estandar para respuestas de error de la API. */
export interface ApiError {
  success: false
  error: string
  code?: string
}

/** Respuesta paginada estandar para listados. */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Parametros de paginacion para queries de listado. */
export interface PaginationParams {
  page?: number
  pageSize?: number
}
