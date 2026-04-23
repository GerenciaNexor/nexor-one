'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { useToast } from '@/components/ui/Toast'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Integration {
  id:             string
  channel:        'WHATSAPP' | 'GMAIL'
  identifier:     string
  branchId:       string | null
  isActive:       boolean
  lastVerifiedAt: string | null
  createdAt:      string
}

type Status = 'connected' | 'error' | 'pending' | 'none'

function getStatus(integration: Integration | undefined): Status {
  if (!integration) return 'none'
  if (integration.isActive) return 'connected'
  if (!integration.lastVerifiedAt) return 'pending'
  return 'error'
}

// ─── Badge de estado ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const MAP = {
    connected: { label: 'Conectado',           cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    error:     { label: 'Error',               cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    pending:   { label: 'Pendiente de prueba', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    none:      { label: 'Sin configurar',      cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
  }
  const { label, cls } = MAP[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ─── Modal de conexión de WhatsApp ───────────────────────────────────────────

interface WhatsAppModalProps {
  onClose:   () => void
  onSuccess: () => void
}

function WhatsAppModal({ onClose, onSuccess }: WhatsAppModalProps) {
  const [form, setForm] = useState({ phoneNumberId: '', accessToken: '' })
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.phoneNumberId.trim()) { setError('El Phone Number ID es requerido'); return }
    if (!form.accessToken.trim())   { setError('El Access Token es requerido'); return }
    setError(''); setSaving(true)
    try {
      await apiClient.post<{ data: Integration }>('/v1/integrations/whatsapp', {
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken:   form.accessToken.trim(),
      })
      onSuccess()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'Error al conectar. Verifica los datos e inténtalo nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

          {/* Cabecera */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500">
                <span className="text-sm font-bold text-white">WA</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Conectar WhatsApp Business</h2>
                <p className="text-xs text-slate-400">Ingresa las credenciales de Meta for Developers</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Instrucciones */}
          <div className="mx-6 mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800">
            <p className="font-semibold mb-1.5">¿Dónde encuentro estos datos?</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Ingresa a <strong>Meta for Developers</strong> → Tu App → WhatsApp → Configuración de API</li>
              <li>El <strong>Phone Number ID</strong> aparece en la sección &ldquo;Números de teléfono&rdquo;</li>
              <li>El <strong>Access Token</strong> es el token de acceso de sistema (permanente) en &ldquo;Configuración de API&rdquo;</li>
              <li>Usa un token de sistema permanente para evitar que expire</li>
            </ol>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="px-6 pb-6">
            <div className="mt-5 space-y-4">

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  value={form.phoneNumberId}
                  onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))}
                  placeholder="123456789012345"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-slate-400">El ID numérico del número de WhatsApp Business</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Access Token
                </label>
                {/* type="password" — el token nunca se muestra en texto plano */}
                <input
                  type="password"
                  value={form.accessToken}
                  onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))}
                  placeholder="EAAxxxxxx..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-slate-400">El token de acceso de sistema permanente de Meta</p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar y continuar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}

// ─── Modal de confirmación de desconexión ─────────────────────────────────────

interface DisconnectModalProps {
  channel:   'WHATSAPP' | 'GMAIL'
  onClose:   () => void
  onConfirm: () => void
}

function DisconnectModal({ channel, onClose, onConfirm }: DisconnectModalProps) {
  const [confirming, setConfirming] = useState(false)
  const label = channel === 'WHATSAPP' ? 'WhatsApp Business' : 'Gmail'

  async function handleConfirm() {
    setConfirming(true)
    await onConfirm()
    setConfirming(false)
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
          <div className="px-6 py-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900">Desconectar {label}</h3>
            <p className="mt-2 text-sm text-slate-500">
              Se eliminará el token de acceso guardado y la integración quedará inactiva.
              Los mensajes recibidos hasta ahora no se borran.
            </p>
            <p className="mt-1 text-xs font-medium text-red-600">Esta acción no se puede deshacer.</p>
          </div>
          <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {confirming ? 'Desconectando…' : 'Sí, desconectar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Tarjeta de integración ───────────────────────────────────────────────────

interface CardProps {
  icon:          React.ReactNode
  name:          string
  description:   string
  integration:   Integration | undefined
  connectLabel:  string
  onConnect:     () => void
  onTest:        () => void
  onDisconnect:  () => void
  testing:       boolean
  disconnecting: boolean
}

function IntegrationCard({
  icon, name, description, integration,
  connectLabel, onConnect, onTest, onDisconnect,
  testing, disconnecting,
}: CardProps) {
  const status = getStatus(integration)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-4">
        {/* Icono del canal */}
        <div className="shrink-0">{icon}</div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{name}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>

          {/* Datos de la integración activa */}
          {integration && (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-slate-700">
                <span className="font-medium">ID / cuenta:</span>{' '}
                <span className="font-mono text-xs">{integration.identifier}</span>
              </p>
              {integration.lastVerifiedAt && (
                <p className="text-xs text-slate-400">
                  Última verificación:{' '}
                  {new Date(integration.lastVerifiedAt).toLocaleDateString('es-CO', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {status === 'none' ? (
            <button
              onClick={onConnect}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              {connectLabel}
            </button>
          ) : (
            <>
              <button
                onClick={onTest}
                disabled={testing}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {testing ? 'Verificando…' : 'Probar conexión'}
              </button>
              <button
                onClick={onDisconnect}
                disabled={disconnecting}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Desconectar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const router  = useRouter()
  const { user } = useAuthStore()

  const { show: showToast, element: toastEl } = useToast()

  const [integrations,   setIntegrations]   = useState<Integration[]>([])
  const [loading,        setLoading]        = useState(true)
  const [waModal,        setWaModal]        = useState(false)
  const [disconnectTarget, setDisconnectTarget] = useState<Integration | null>(null)
  const [testing,        setTesting]        = useState<string | null>(null)
  const [connectingGmail, setConnectingGmail] = useState(false)

  // Guardia de roles: solo BRANCH_ADMIN y superiores
  useEffect(() => {
    if (!user) return
    const allowed = ['BRANCH_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN']
    if (!allowed.includes(user.role)) {
      router.replace('/dashboard')
    }
  }, [user, router])

  // Leer resultado del OAuth de Gmail desde la URL (?gmail=success|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gmail  = params.get('gmail')
    if (gmail === 'success') showToast('Gmail conectado correctamente', true)
    if (gmail === 'error') {
      const reason = params.get('reason') ?? 'unknown'
      showToast(reason === 'cancelled'
        ? 'Autorizacion cancelada por el usuario'
        : 'Error al conectar Gmail. Inténtalo nuevamente.',
        false)
    }
    // Limpiar parámetros de la URL sin recargar
    if (gmail) window.history.replaceState({}, '', '/settings/integrations')
  }, [])

  async function load() {
    try {
      const data = await apiClient.get<{ data: Integration[] }>('/v1/integrations')
      setIntegrations(data.data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleConnectGoogle() {
    setConnectingGmail(true)
    try {
      const data = await apiClient.get<{ data: { authUrl: string } }>('/v1/integrations/gmail/oauth')
      window.location.href = data.data.authUrl
    } catch (err: unknown) {
      const e = err as { message?: string }
      showToast(e.message ?? 'No se pudo iniciar la autorización de Google', false)
      setConnectingGmail(false)
    }
  }

  async function handleTest(integration: Integration) {
    setTesting(integration.id)
    try {
      const result = await apiClient.get<{ success: boolean; data: { success: boolean; message: string } }>(
        `/v1/integrations/${integration.id}/test`,
      )
      showToast(result.data.message, result.data.success)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      showToast(e.message ?? 'Error al probar la conexión', false)
    } finally {
      setTesting(null)
    }
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return
    try {
      await apiClient.delete(`/v1/integrations/${disconnectTarget.id}`)
      const label = disconnectTarget.channel === 'WHATSAPP' ? 'WhatsApp' : 'Gmail'
      showToast(`${label} desconectado correctamente`, true)
      setDisconnectTarget(null)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      showToast(e.message ?? 'Error al desconectar', false)
      setDisconnectTarget(null)
    }
  }

  const waIntegration    = integrations.find((i) => i.channel === 'WHATSAPP')
  const gmailIntegration = integrations.find((i) => i.channel === 'GMAIL')

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <div className="h-6 w-48 rounded-lg bg-slate-200 animate-pulse dark:bg-slate-700" />
          <div className="mt-2 h-4 w-72 rounded bg-slate-100 animate-pulse dark:bg-slate-700" />
        </div>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-slate-100 bg-white animate-pulse dark:border-slate-700 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">

      {/* Encabezado */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integraciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Conecta los canales de comunicación de tu empresa para gestionar mensajes desde NEXOR.
        </p>
      </div>

      {/* Tarjetas de canales */}
      <div className="space-y-4">

        {/* WhatsApp Business */}
        <IntegrationCard
          icon={
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
          }
          name="WhatsApp Business"
          description="Recibe y responde mensajes de WhatsApp de tus clientes directamente desde NEXOR."
          integration={waIntegration}
          connectLabel="Conectar WhatsApp"
          onConnect={() => setWaModal(true)}
          onTest={() => handleTest(waIntegration!)}
          onDisconnect={() => setDisconnectTarget(waIntegration!)}
          testing={testing === waIntegration?.id}
          disconnecting={disconnectTarget?.id === waIntegration?.id}
        />

        {/* Gmail */}
        <IntegrationCard
          icon={
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" fill="#EA4335" opacity=".2"/>
                <path d="M20 4H4L12 13l8-9z" fill="#EA4335"/>
                <path d="M2 6l10 7 10-7" stroke="#FBBC04" strokeWidth="1.5" fill="none"/>
              </svg>
            </div>
          }
          name="Gmail"
          description="Recibe emails de tus clientes y gestiónalos desde NEXOR con ayuda de IA."
          integration={gmailIntegration}
          connectLabel={connectingGmail ? 'Redirigiendo a Google…' : 'Conectar con Google'}
          onConnect={handleConnectGoogle}
          onTest={() => handleTest(gmailIntegration!)}
          onDisconnect={() => setDisconnectTarget(gmailIntegration!)}
          testing={testing === gmailIntegration?.id}
          disconnecting={disconnectTarget?.id === gmailIntegration?.id}
        />
      </div>

      {/* Nota de seguridad */}
      <p className="mt-6 text-center text-xs text-slate-400">
        Tus credenciales se cifran con AES-256 antes de guardarse. NEXOR nunca expone tokens en texto plano.
      </p>

      {/* Modal WhatsApp */}
      {waModal && (
        <WhatsAppModal
          onClose={() => setWaModal(false)}
          onSuccess={async () => {
            setWaModal(false)
            showToast('WhatsApp guardado. Usa "Probar conexión" para verificar que funciona.', true)
            await load()
          }}
        />
      )}

      {/* Modal desconexión */}
      {disconnectTarget && (
        <DisconnectModal
          channel={disconnectTarget.channel}
          onClose={() => setDisconnectTarget(null)}
          onConfirm={handleDisconnect}
        />
      )}

      {toastEl}
    </div>
  )
}
