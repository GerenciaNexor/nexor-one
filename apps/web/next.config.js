const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Transpila los paquetes del monorepo para que Next.js pueda importar TypeScript desde packages/. */
  transpilePackages: ['@nexor/shared'],
}

module.exports = withSentryConfig(nextConfig, {
  // DSN silenciado en build — se lee en runtime desde NEXT_PUBLIC_SENTRY_DSN
  silent: true,

  // No subir source maps en desarrollo
  disableServerWebpackPlugin: process.env['NODE_ENV'] !== 'production',
  disableClientWebpackPlugin: process.env['NODE_ENV'] !== 'production',

  // Ocultar source maps del bundle publico
  hideSourceMaps: true,
})
