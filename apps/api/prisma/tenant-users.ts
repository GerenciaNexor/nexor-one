/**
 * Utilidad de operación — listar usuarios de un tenant y (opcional) restablecer una contraseña.
 *
 * ⚠️ Se conecta a la BD que tengas en DIRECT_DATABASE_URL (en este proyecto = PRODUCCIÓN).
 * Las contraseñas ORIGINALES no se pueden recuperar (bcrypt, una sola vía); solo se pueden RESTABLECER.
 *
 * Uso:
 *   # 1) Buscar tenant(s) por nombre/slug y listar sus usuarios (solo lectura):
 *   pnpm --filter @nexor/api exec tsx prisma/tenant-users.ts --find disrupt
 *
 *   # 2) Restablecer la contraseña de UN usuario a un valor conocido (ESCRIBE en la BD):
 *   pnpm --filter @nexor/api exec tsx prisma/tenant-users.ts --reset correo@empresa.com --password "NuevaClave123"
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const args = process.argv.slice(2)
const val = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const url = process.env['DIRECT_DATABASE_URL'] || process.env['DATABASE_URL']
const db = new PrismaClient({ datasources: { db: { url } } })

async function main() {
  const find  = val('--find')
  const reset = val('--reset')
  const pwd   = val('--password')

  if (reset) {
    if (!pwd || pwd.length < 8) { console.error('❌ Indica una contraseña de al menos 8 caracteres con --password "…"'); process.exit(1) }
    const user = await db.user.findFirst({ where: { email: reset.toLowerCase() }, select: { id: true, email: true, name: true, tenantId: true } })
    if (!user) { console.error(`❌ No existe un usuario con el correo ${reset}`); process.exit(1) }
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(pwd, 12) } })
    console.log(`✅ Contraseña restablecida para ${user.email} (${user.name}).`)
    console.log(`   Usuario:     ${user.email}`)
    console.log(`   Contraseña:  ${pwd}`)
    console.log('   Entra en /login con esas credenciales.')
    return
  }

  const where = find
    ? { OR: [{ name: { contains: find, mode: 'insensitive' as const } }, { slug: { contains: find, mode: 'insensitive' as const } }] }
    : {}
  const tenants = await db.tenant.findMany({ where, select: { id: true, name: true, slug: true, isActive: true }, orderBy: { name: 'asc' } })
  if (tenants.length === 0) { console.log(`No hay tenants que coincidan con "${find ?? ''}".`); return }

  for (const t of tenants) {
    console.log(`\n== ${t.name}  (slug: ${t.slug} · activo: ${t.isActive}) ==`)
    const users = await db.user.findMany({ where: { tenantId: t.id }, select: { email: true, name: true, role: true, module: true, isActive: true }, orderBy: [{ role: 'asc' }, { email: 'asc' }] })
    if (users.length === 0) { console.log('  (sin usuarios)'); continue }
    for (const u of users) console.log(`  - ${u.email}  |  ${u.name}  |  ${u.role}${u.module ? '/' + u.module : ''}  |  activo: ${u.isActive}`)
  }
  console.log('\nNota: las contraseñas no se muestran (solo se guarda su hash). Para poder entrar, restablécelas con --reset.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
