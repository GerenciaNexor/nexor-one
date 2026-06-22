import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

async function main() {
  console.log('\n=== TENANTS ===')
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.table(tenants)

  console.log('\n=== USUARIOS POR ROL ===')
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, tenantId: true },
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  })
  console.table(users)

  console.log('\n=== INTEGRACIONES ACTIVAS ===')
  const integrations = await prisma.integration.findMany({
    select: { id: true, tenantId: true, channel: true, isActive: true },
  })
  console.table(integrations)

  console.log('\n=== FEATURE FLAGS ===')
  const flags = await prisma.featureFlag.findMany({
    select: { tenantId: true, module: true, enabled: true },
    orderBy: [{ tenantId: 'asc' }, { module: 'asc' }],
  })
  console.table(flags)

  console.log(`\nTotales: ${tenants.length} tenants, ${users.length} usuarios, ${integrations.length} integraciones, ${flags.length} flags\n`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
