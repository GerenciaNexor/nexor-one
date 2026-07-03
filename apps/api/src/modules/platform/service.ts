/**
 * Servicio de autenticación de PLATAFORMA (HU-134).
 * Identidad del equipo NEXOR: tabla `platform_admins`, SIN tenant_id.
 * Usa `directPrisma` (superuser) porque corre fuera de todo contexto de tenant
 * y la tabla tiene RLS que impide a nexor_app leerla.
 */
import bcrypt from 'bcryptjs'
import { directPrisma } from '../../lib/prisma'

const INVALID_CREDENTIALS = 'Credenciales incorrectas'
// Hash dummy para igualar el tiempo de respuesta ante emails inexistentes (anti timing-attack).
const DUMMY_HASH = '$2b$12$dummyhashtopreventtimingattacks.placeholder00000000000'

export async function loginPlatformAdmin(email: string, password: string) {
  const admin = await directPrisma.platformAdmin.findUnique({
    where:  { email },
    select: { id: true, email: true, name: true, passwordHash: true, isActive: true },
  })

  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH)
    throw { statusCode: 401, message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' }
  }

  const passwordValid = await bcrypt.compare(password, admin.passwordHash)
  if (!passwordValid) {
    throw { statusCode: 401, message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' }
  }

  if (!admin.isActive) {
    throw { statusCode: 403, message: 'Cuenta desactivada. Contacta al equipo NEXOR.', code: 'ACCOUNT_DISABLED' }
  }

  // lastLoginAt en segundo plano — no bloquea el login
  directPrisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } }).catch(() => {})

  return { id: admin.id, email: admin.email, name: admin.name }
}

/** Verifica que un platform_admin siga existiendo y activo (para el hook de plataforma). */
export async function isPlatformAdminActive(platformAdminId: string): Promise<boolean> {
  const admin = await directPrisma.platformAdmin.findUnique({
    where:  { id: platformAdminId },
    select: { isActive: true },
  })
  return !!admin?.isActive
}
