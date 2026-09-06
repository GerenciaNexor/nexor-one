import { defineConfig } from 'tsup'

/**
 * El paquete @nexor/shared se distribuye como CÓDIGO FUENTE TS (main: src/index.ts, sin build). Al
 * importar VALORES de él (no solo tipos), tsup NO debe externalizarlo: si lo deja como
 * `require('@nexor/shared')`, en runtime Node resuelve el .ts fuente y sus re-exports sin extensión
 * (`export * from './types/auth'`) rompen en ESM (ERR_MODULE_NOT_FOUND). `noExternal` lo empaqueta
 * (inline) dentro del bundle de la API. El resto de opciones vienen del CLI del script `build`.
 */
export default defineConfig({
  noExternal: ['@nexor/shared'],
})
