import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { directPrisma as prisma } from '../../lib/prisma'

const INVALID_CREDENTIALS = 'Credenciales incorrectas'
const INVALID_REFRESH = 'Refresh token invalido o expirado'

const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env['REFRESH_TOKEN_EXPIRES_DAYS'] ?? 30)

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(64).toString('hex')
  const hash = hashToken(raw)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS)
  return { raw, hash, expiresAt }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      module: true,
      passwordHash: true,
      isActive: true,
      tenantId: true,
      branchId: true,
      tenant: { select: { id: true, name: true, slug: true } },
    },
  })

  // Dummy compare to prevent timing attacks on non-existent emails
  if (!user) {
    await bcrypt.compare(password, '$2b$12$dummyhashtopreventtimingattacks.placeholder00000000000')
    throw { statusCode: 401, message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' }
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash)
  if (!passwordValid) {
    throw { statusCode: 401, message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' }
  }

  if (!user.isActive) {
    throw { statusCode: 403, message: 'Cuenta desactivada. Contacta al administrador.', code: 'ACCOUNT_DISABLED' }
  }

  const refreshToken = generateRefreshToken()
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshToken.hash, expiresAt: refreshToken.expiresAt },
  })

  // Actualizar lastLoginAt en segundo plano
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})

  return {
    refreshToken: refreshToken.raw,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    module: user.module ?? undefined,
    tenantId: user.tenantId,
    branchId: user.branchId,
    tenant: user.tenant,
  }
}

export async function refresh(rawToken: string) {
  const hash = hashToken(rawToken)

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          role: true,
          module: true,
          isActive: true,
        },
      },
    },
  })

  if (!stored || stored.expiresAt < new Date()) {
    // Limpiar token expirado si existia
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {})
    }
    throw { statusCode: 401, message: INVALID_REFRESH, code: 'INVALID_REFRESH_TOKEN' }
  }

  if (!stored.user.isActive) {
    throw { statusCode: 403, message: 'Cuenta desactivada. Contacta al administrador.', code: 'ACCOUNT_DISABLED' }
  }

  return {
    userId: stored.user.id,
    tenantId: stored.user.tenantId,
    branchId: stored.user.branchId,
    role: stored.user.role,
    module: stored.user.module ?? undefined,
  }
}

export async function logout(rawToken: string): Promise<void> {
  const hash = hashToken(rawToken)
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hash } })
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      module: true,
      tenantId: true,
      branchId: true,
      tenant: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  })

  if (!user) {
    throw { statusCode: 401, message: 'Usuario no encontrado', code: 'UNAUTHORIZED' }
  }

  const featureFlagsRaw = await prisma.featureFlag.findMany({
    where: { tenantId: user.tenantId },
    select: { module: true, enabled: true },
  })

  const featureFlags = Object.fromEntries(
    featureFlagsRaw.map((f) => [f.module, f.enabled]),
  ) as Record<string, boolean>

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    module: user.module ?? null,
    tenant: user.tenant,
    branch: user.branch ?? null,
    featureFlags,
  }
}
