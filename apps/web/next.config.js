/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Transpila los paquetes del monorepo para que Next.js pueda importar TypeScript desde packages/. */
  transpilePackages: ['@nexor/shared'],
}

module.exports = nextConfig
