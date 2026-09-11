/**
 * Utilidad puntual — corregir el NOMBRE de un usuario por su correo (typo).
 *
 * ⚠️ Escribe en DIRECT_DATABASE_URL (en este proyecto = PRODUCCIÓN). Solo cambia el campo `name`.
 *
 * Uso:
 *   # Ver el nombre actual (solo lectura):
 *   pnpm --filter @nexor/api exec tsx prisma/fix-user-name.ts --email correo@empresa.com
 *   # Cambiarlo (ESCRIBE):
 *   pnpm --filter @nexor/api exec tsx prisma/fix-user-name.ts --email correo@empresa.com --name "Nombre Correcto"
 */
import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const val = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const url = process.env['DIRECT_DATABASE_URL'] || process.env['DATABASE_URL']
const db = new PrismaClient({ datasources: { db: { url } } })

async function main() {
  const email   = val('--email')?.toLowerCase()
  const newName = val('--name')
  if (!email) { console.error('❌ Indica el correo con --email correo@empresa.com'); process.exit(1) }

  const user = await db.user.findFirst({ where: { email }, select: { id: true, email: true, name: true, tenantId: true } })
  if (!user) { console.error(`❌ No existe un usuario con el correo ${email}`); process.exit(1) }

  console.log(`Usuario: ${user.email}`)
  console.log(`Nombre actual: "${user.name}"`)

  if (!newName) { console.log('\n(solo lectura — pasa --name "Nombre Correcto" para cambiarlo)'); return }

  await db.user.update({ where: { id: user.id }, data: { name: newName } })
  console.log(`✅ Nombre actualizado a: "${newName}"`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
