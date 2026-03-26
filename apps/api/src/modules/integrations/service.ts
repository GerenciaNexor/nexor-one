/**
 * Servicio de integraciones — Gmail OAuth2
 *
 * Flujo:
 *   1. generateGmailOAuthUrl()    → URL de autorización de Google (frontend redirige aquí)
 *   2. handleGmailCallback()      → intercambia el código, cifra el refresh_token, guarda
 *   3. refreshGmailAccessToken()  → genera access_token fresco a partir del refresh_token
 *                                    (usado por HU-036+ cuando NEXOR envía emails)
 *
 * Seguridad:
 *   - refresh_token siempre cifrado en DB con AES-256 (HU-031)
 *   - access_token NUNCA se guarda — expira en 1h, se genera fresh desde refresh_token
 *   - state del OAuth firmado con HMAC para prevenir CSRF
 *   - Tokens nunca aparecen en ningún response de la API
 */

import crypto from 'node:crypto'
import { google, type Auth } from 'googleapis'
import { encrypt, decrypt } from '../../lib/encryption'
import { prisma, directPrisma } from '../../lib/prisma'

// ─── Configuración ────────────────────────────────────────────────────────────

/** Solo lectura de Gmail — nunca permisos de escritura */
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

/** Minutos de validez del state OAuth antes de expirar */
const STATE_TTL_MS = 10 * 60 * 1000

// ─── OAuth2 client ────────────────────────────────────────────────────────────

function createOAuth2Client() {
  const clientId     = process.env['GOOGLE_CLIENT_ID']
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']
  const redirectUri  = process.env['GOOGLE_REDIRECT_URI']

  if (!clientId || !clientSecret || !redirectUri) {
    throw Object.assign(
      new Error('Google OAuth no está configurado. Verifica GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.'),
      { statusCode: 503, code: 'OAUTH_NOT_CONFIGURED' },
    )
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

// ─── CSRF state — firmado con HMAC para prevenir ataques ─────────────────────

interface OAuthState {
  tenantId: string
  userId:   string
  ts:       number
}

function signOAuthState(payload: OAuthState): string {
  const json = JSON.stringify(payload)
  const b64  = Buffer.from(json).toString('base64url')
  const hmac = crypto
    .createHmac('sha256', process.env['JWT_SECRET'] ?? 'fallback')
    .update(b64)
    .digest('hex')
  return `${b64}.${hmac}`
}

function verifyOAuthState(state: string): OAuthState | null {
  try {
    const dotIndex = state.lastIndexOf('.')
    if (dotIndex === -1) return null

    const b64      = state.slice(0, dotIndex)
    const sig      = state.slice(dotIndex + 1)
    const expected = crypto
      .createHmac('sha256', process.env['JWT_SECRET'] ?? 'fallback')
      .update(b64)
      .digest('hex')

    // Comparación resistente a timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null

    const payload: OAuthState = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))

    // Verificar expiración del state
    if (Date.now() - payload.ts > STATE_TTL_MS) return null

    return payload
  } catch {
    return null
  }
}

// ─── Tipo público de integración (sin tokens) ─────────────────────────────────

export interface SafeIntegration {
  id:            string
  channel:       string
  identifier:    string   // email address para Gmail
  isActive:      boolean
  lastVerifiedAt: string | null
  metadata:      unknown
  createdAt:     string
  updatedAt:     string
}

// ─── Generar URL de autorización de Google ───────────────────────────────────

/**
 * Genera la URL de OAuth2 de Google a la que el frontend debe redirigir al usuario.
 * El state es firmado con HMAC para prevenir CSRF.
 */
export function generateGmailOAuthUrl(tenantId: string, userId: string): string {
  const client = createOAuth2Client()
  const state  = signOAuthState({ tenantId, userId, ts: Date.now() })

  return client.generateAuthUrl({
    access_type: 'offline',
    scope:       GMAIL_SCOPES,
    state,
    // 'consent' fuerza a Google a devolver refresh_token en cada autorización.
    // Sin esto, Google solo lo devuelve la primera vez.
    prompt:      'consent',
  })
}

// ─── Manejar el callback de Google ───────────────────────────────────────────

export interface GmailCallbackResult {
  tenantId: string
  email:    string
}

/**
 * Intercambia el código de autorización de Google por tokens.
 * Cifra el refresh_token y lo guarda en integrations.
 * Configura el watch de Gmail para notificaciones via Pub/Sub.
 *
 * El access_token NUNCA se guarda.
 */
export async function handleGmailCallback(
  code:  string,
  state: string,
): Promise<GmailCallbackResult> {

  // ── 1. Verificar state (CSRF) ──────────────────────────────────────────────
  const statePayload = verifyOAuthState(state)
  if (!statePayload) {
    throw Object.assign(
      new Error('Estado OAuth inválido o expirado. Inicia el proceso de conexión nuevamente.'),
      { statusCode: 400, code: 'INVALID_OAUTH_STATE' },
    )
  }
  const { tenantId } = statePayload

  // ── 2. Intercambiar código por tokens ──────────────────────────────────────
  const client = createOAuth2Client()
  let tokens: Auth.Credentials

  try {
    const response = await client.getToken(code)
    tokens = response.tokens
  } catch {
    throw Object.assign(
      new Error('No se pudo intercambiar el código con Google. Puede que haya expirado.'),
      { statusCode: 400, code: 'OAUTH_CODE_EXCHANGE_FAILED' },
    )
  }

  // Google solo devuelve refresh_token si prompt='consent'. Si falta, el usuario
  // debe revocar el acceso desde su cuenta Google y reconectar.
  if (!tokens.refresh_token) {
    throw Object.assign(
      new Error('Google no devolvió refresh_token. Revoca el acceso desde tu cuenta de Google y vuelve a conectar.'),
      { statusCode: 400, code: 'NO_REFRESH_TOKEN' },
    )
  }

  // ── 3. Obtener email del usuario ───────────────────────────────────────────
  client.setCredentials(tokens)
  const oauth2Api = google.oauth2({ version: 'v2', auth: client })
  const { data: userInfo } = await oauth2Api.userinfo.get()
  const email = userInfo.email

  if (!email) {
    throw Object.assign(
      new Error('No se pudo obtener el email de Google.'),
      { statusCode: 400, code: 'NO_EMAIL' },
    )
  }

  // ── 4. Cifrar refresh_token (AES-256) — access_token no se guarda ──────────
  const encryptedRefreshToken = encrypt(tokens.refresh_token)

  // ── 5. Upsert en tabla integrations ───────────────────────────────────────
  const now     = new Date()
  const existing = await prisma.integration.findFirst({
    where:  { tenantId, channel: 'GMAIL' },
    select: { id: true },
  })

  if (existing) {
    await prisma.integration.update({
      where: { id: existing.id },
      data: {
        identifier:     email,
        tokenEncrypted: encryptedRefreshToken,
        isActive:       true,
        lastVerifiedAt: now,
        metadata:       { scope: GMAIL_SCOPES[0] },
      },
    })
  } else {
    await prisma.integration.create({
      data: {
        tenantId,
        channel:        'GMAIL',
        identifier:     email,
        tokenEncrypted: encryptedRefreshToken,
        isActive:       true,
        lastVerifiedAt: now,
        metadata:       { scope: GMAIL_SCOPES[0] },
      },
    })
  }

  // ── 6. Configurar Gmail watch (Pub/Sub) ───────────────────────────────────
  await setupGmailWatch(client, tenantId)

  return { tenantId, email }
}

// ─── Gmail watch (notificaciones via Pub/Sub) ─────────────────────────────────

async function setupGmailWatch(
  auth: InstanceType<typeof google.auth.OAuth2>,
  tenantId: string,
): Promise<void> {
  const topicName = process.env['GOOGLE_PUBSUB_TOPIC']

  if (!topicName) {
    console.warn('[gmail] GOOGLE_PUBSUB_TOPIC no está configurado — watch de Gmail no activado')
    return
  }

  try {
    const gmail    = google.gmail({ version: 'v1', auth })
    const response = await gmail.users.watch({
      userId:      'me',
      requestBody: {
        labelIds:  ['INBOX'],
        topicName,
      },
    })

    // Actualizar metadata con datos del watch (expira cada 7 días — HU-037 lo renueva)
    const watchExpiry = response.data.expiration
      ? new Date(Number(response.data.expiration)).toISOString()
      : null
    const historyId = response.data.historyId ?? null

    await prisma.integration.updateMany({
      where: { tenantId, channel: 'GMAIL' },
      data:  {
        metadata: {
          scope:       GMAIL_SCOPES[0],
          watchExpiry,
          historyId,
        },
      },
    })

    console.info(`[gmail] Watch configurado para tenant ${tenantId} — expira: ${watchExpiry}`)
  } catch (err) {
    // El watch falla si el topic de Pub/Sub no está configurado en Google Cloud.
    // No bloqueamos el OAuth por esto — el admin puede reconectar cuando el topic esté listo.
    console.error('[gmail] Error configurando watch:', err instanceof Error ? err.message : err)
  }
}

// ─── Generar access_token fresco desde refresh_token ─────────────────────────

/**
 * Obtiene un access_token fresco para llamadas a la API de Gmail.
 * Usado por servicios internos (HU-036+) — NUNCA expone el token en la API.
 *
 * Si el refresh_token fue revocado por el usuario, marca la integración
 * como inactiva y lanza un error descriptivo.
 */
export async function refreshGmailAccessToken(tenantId: string): Promise<string> {
  const integration = await prisma.integration.findFirst({
    where:  { tenantId, channel: 'GMAIL', isActive: true },
    select: { id: true, tokenEncrypted: true },
  })

  if (!integration?.tokenEncrypted) {
    throw Object.assign(
      new Error('No hay integración de Gmail activa para este tenant.'),
      { statusCode: 404, code: 'GMAIL_NOT_CONNECTED' },
    )
  }

  const refreshToken = decrypt(integration.tokenEncrypted)
  const client       = createOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })

  try {
    const { credentials } = await client.refreshAccessToken()
    if (!credentials.access_token) {
      throw new Error('Google no devolvió access_token')
    }
    return credentials.access_token
  } catch (err) {
    const isRevoked =
      err instanceof Error &&
      (err.message.includes('invalid_grant') || err.message.includes('Token has been expired'))

    if (isRevoked) {
      // Marcar integración como desconectada
      await prisma.integration.update({
        where: { id: integration.id },
        data:  { isActive: false },
      })
      throw Object.assign(
        new Error('El acceso a Gmail fue revocado por el usuario. Reconecta la integración.'),
        { statusCode: 401, code: 'GMAIL_TOKEN_REVOKED' },
      )
    }

    throw Object.assign(
      new Error('Error al renovar el token de Gmail.'),
      { statusCode: 503, code: 'GMAIL_REFRESH_FAILED' },
    )
  }
}

// ─── Listar integraciones del tenant ─────────────────────────────────────────

/**
 * Devuelve todas las integraciones del tenant SIN incluir tokens.
 */
export async function getIntegrations(tenantId: string): Promise<SafeIntegration[]> {
  const rows = await prisma.integration.findMany({
    where:   { tenantId },
    select: {
      id:            true,
      channel:       true,
      identifier:    true,
      isActive:      true,
      lastVerifiedAt: true,
      metadata:      true,
      createdAt:     true,
      updatedAt:     true,
      // tokenEncrypted: OMITIDO INTENCIONALMENTE — nunca en responses
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map((r: typeof rows[number]) => ({
    ...r,
    lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  }))
}

// ─── WhatsApp — conexión por tenant ──────────────────────────────────────────

/** Campos seguros que se devuelven en respuestas (sin tokenEncrypted). */
const SAFE_SELECT = {
  id:             true,
  channel:        true,
  identifier:     true,
  branchId:       true,
  isActive:       true,
  lastVerifiedAt: true,
  metadata:       true,
  createdAt:      true,
  updatedAt:      true,
} as const

type SafeRow = {
  id:             string
  channel:        string
  identifier:     string
  branchId:       string | null
  isActive:       boolean
  lastVerifiedAt: Date | null
  metadata:       unknown
  createdAt:      Date
  updatedAt:      Date
}

function toSafe(r: SafeRow): SafeIntegration & { branchId: string | null } {
  return {
    id:             r.id,
    channel:        r.channel,
    identifier:     r.identifier,
    branchId:       r.branchId,
    isActive:       r.isActive,
    lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
    metadata:       r.metadata,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  }
}

export interface WhatsAppConnectInput {
  phoneNumberId: string
  accessToken:   string
  branchId?:     string
}

/**
 * Registra o actualiza un número de WhatsApp Business para un tenant.
 *
 * - phone_number_id es único en toda la plataforma — no puede estar en dos tenants.
 * - El access_token se cifra con AES-256 antes de guardarse.
 * - La integración queda is_active: false hasta que se llame a testWhatsAppIntegration().
 * - El access_token NUNCA se devuelve en el response.
 */
export async function connectWhatsApp(
  tenantId: string,
  input:    WhatsAppConnectInput,
): Promise<SafeIntegration & { branchId: string | null }> {
  const { phoneNumberId, accessToken, branchId } = input

  // ── Verificar unicidad global del phone_number_id ─────────────────────────
  // directPrisma bypasea RLS para ver todos los tenants.
  const conflict = await directPrisma.integration.findFirst({
    where:  { channel: 'WHATSAPP', identifier: phoneNumberId },
    select: { id: true, tenantId: true },
  })

  if (conflict && conflict.tenantId !== tenantId) {
    throw Object.assign(
      new Error('Este phone_number_id ya está registrado en otra empresa. Contacta al soporte de NEXOR.'),
      { statusCode: 409, code: 'PHONE_NUMBER_ID_TAKEN' },
    )
  }

  const encryptedToken = encrypt(accessToken)

  if (conflict && conflict.tenantId === tenantId) {
    // Re-registro del mismo tenant: actualizar token (token puede haber rotado)
    const updated = await prisma.integration.update({
      where:  { id: conflict.id },
      data:   {
        tokenEncrypted: encryptedToken,
        isActive:       false,
        branchId:       branchId ?? null,
        metadata:       {},
      },
      select: SAFE_SELECT,
    })
    return toSafe(updated)
  }

  const created = await prisma.integration.create({
    data: {
      tenantId,
      channel:        'WHATSAPP',
      identifier:     phoneNumberId,
      tokenEncrypted: encryptedToken,
      isActive:       false,
      branchId:       branchId ?? null,
      metadata:       {},
    },
    select: SAFE_SELECT,
  })
  return toSafe(created)
}

// ─── WhatsApp — test de conectividad con Meta ─────────────────────────────────

export interface TestResult {
  success: boolean
  message: string
}

/**
 * Verifica que el token de una integración sigue siendo válido.
 * Funciona para WHATSAPP (llama a Graph API de Meta) y GMAIL (refresca el token).
 * El token nunca se expone en el response.
 */
export async function testIntegration(
  tenantId:      string,
  integrationId: string,
): Promise<TestResult> {
  const integration = await prisma.integration.findFirst({
    where:  { id: integrationId, tenantId },
    select: { id: true, identifier: true, tokenEncrypted: true, channel: true },
  })

  if (!integration) {
    throw Object.assign(
      new Error('Integración no encontrada.'),
      { statusCode: 404, code: 'INTEGRATION_NOT_FOUND' },
    )
  }

  if (!integration.tokenEncrypted) {
    throw Object.assign(
      new Error('Esta integración no tiene token configurado. Reconecta.'),
      { statusCode: 400, code: 'NO_TOKEN' },
    )
  }

  let testPassed   = false
  let errorMessage = ''

  if (integration.channel === 'WHATSAPP') {
    const accessToken   = decrypt(integration.tokenEncrypted)
    const phoneNumberId = integration.identifier

    try {
      const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}`, {
        method:  'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (resp.ok) {
        testPassed = true
      } else {
        const body = await resp.json() as { error?: { message?: string } }
        errorMessage = body?.error?.message ?? `HTTP ${resp.status}`
      }
    } catch {
      errorMessage = 'No se pudo conectar con la API de Meta. Verifica la conectividad.'
    }

  } else if (integration.channel === 'GMAIL') {
    const refreshToken = decrypt(integration.tokenEncrypted)
    const oauthClient  = new google.auth.OAuth2(
      process.env['GOOGLE_CLIENT_ID'],
      process.env['GOOGLE_CLIENT_SECRET'],
    )
    oauthClient.setCredentials({ refresh_token: refreshToken })

    try {
      const { credentials } = await oauthClient.refreshAccessToken()
      testPassed = !!credentials.access_token
      if (!testPassed) errorMessage = 'Google no devolvió access_token'
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      errorMessage = msg.includes('invalid_grant')
        ? 'Acceso revocado — vuelve a conectar Gmail desde tu cuenta de Google'
        : 'Error al comunicarse con Google'
    }
  }

  // last_verified_at solo se actualiza cuando la verificación es exitosa
  await prisma.integration.update({
    where: { id: integration.id },
    data:  {
      isActive:       testPassed,
      lastVerifiedAt: testPassed ? new Date() : undefined,
    },
  })

  const channelLabel = integration.channel === 'WHATSAPP' ? 'WhatsApp' : 'Gmail'
  return {
    success: testPassed,
    message: testPassed
      ? `Conexión con ${channelLabel} verificada correctamente`
      : `Verificación fallida: ${errorMessage}`,
  }
}

// ─── Desconectar integración ──────────────────────────────────────────────────

/**
 * Desconecta una integración: elimina el token cifrado y la marca inactiva.
 * El registro permanece para auditoría — no se elimina de la DB.
 */
export async function disconnectIntegration(
  tenantId:      string,
  integrationId: string,
): Promise<void> {
  const integration = await prisma.integration.findFirst({
    where:  { id: integrationId, tenantId },
    select: { id: true },
  })

  if (!integration) {
    throw Object.assign(
      new Error('Integración no encontrada.'),
      { statusCode: 404, code: 'INTEGRATION_NOT_FOUND' },
    )
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data:  {
      tokenEncrypted: null,
      isActive:       false,
      lastVerifiedAt: null,
    },
  })
}
