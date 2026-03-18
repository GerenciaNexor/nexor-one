import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],
  enabled: process.env['NODE_ENV'] === 'production',
  environment: process.env['NODE_ENV'] ?? 'development',

  // Muestras de trazas de rendimiento (10% en produccion)
  tracesSampleRate: 0.1,

  // Replays solo cuando hay un error — no graba sesiones normales
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  integrations: [
    Sentry.replayIntegration({
      // No capturar texto ni inputs — evita datos sensibles
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],

  beforeSend(event) {
    // Eliminar datos sensibles del request capturado
    if (event.request?.headers) {
      const headers = { ...event.request.headers }
      delete headers['authorization']
      delete headers['cookie']
      event.request.headers = headers
    }
    return event
  },
})
