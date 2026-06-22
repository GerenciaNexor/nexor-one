import 'fastify'

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * HU-122 — Si es `false`, el handler de la ruta NO se envuelve en la transacción
     * de tenant por-request (runInTenantTransaction). Úsalo en rutas que hacen I/O
     * externo pesado o que gestionan su propia transacción (p. ej. dashboard/kpis).
     */
    tenantTx?: boolean
  }
}
