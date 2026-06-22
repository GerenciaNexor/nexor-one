import { PrismaClient, ModuleName } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'nexor' } })
  if (!tenant) {
    console.error('❌ Tenant "nexor" no existe')
    process.exit(1)
  }
  const result = await prisma.featureFlag.createMany({
    data: (Object.values(ModuleName) as ModuleName[]).map((module) => ({
      tenantId: tenant.id,
      module,
      enabled: false,
    })),
    skipDuplicates: true,
  })
  console.log(`✅ ${result.count} feature_flags creados para tenant "${tenant.name}" (${tenant.id})`)

  const flags = await prisma.featureFlag.findMany({
    where: { tenantId: tenant.id },
    select: { module: true, enabled: true },
    orderBy: { module: 'asc' },
  })
  console.table(flags)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
