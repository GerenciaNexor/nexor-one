import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],
  enabled: process.env['NODE_ENV'] === 'production',
  environment: process.env['NODE_ENV'] ?? 'development',
  tracesSampleRate: 0.1,

  beforeSend(event) {
    if (event.request?.headers) {
      const headers = { ...event.request.headers }
      delete headers['authorization']
      delete headers['cookie']
      event.request.headers = headers
    }
    return event
  },
})
