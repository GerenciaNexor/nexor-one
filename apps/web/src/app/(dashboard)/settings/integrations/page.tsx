'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Integration {
  id:             string
  channel:        'WHATSAPP' | 'GMAIL'
  identifier:     string
  branchId?:      string | null
  isActive:       boolean
  lastVerifiedAt: string | null
}

type Status = 'connected' | 'pending' | 'none'

function getStatus(integration: Integration | undefined): Status {
  if (!integration) return 'none'
  if (integration.isActive) return 'connected'
  return 'pending'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Badge de estado ──────────────────────────────────────────────────────────

function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ─── Tarjeta de estado (solo lectura) ─────────────────────────────────────────

interface CardProps {
  icon:        React.ReactNode
  name:        string
  description: string
  integration: Integration | undefined
  channel:     'WHATSAPP' | 'GMAIL'
}

function StatusCard({ icon, name, description, integration, channel }: CardProps) {
  const status = getStatus(integration)

  // Etiqueta/estilo del badge según canal y estado
  let badge: { label: string; cls: string }
  if (status === 'connected') {
    badge = { label: 'Conectado', cls: 'bg-emerald-100 text-emerald-700' }
  } else if (status === 'pending') {
    badge = channel === 'WHATSAPP'
      ? { label: 'Pendiente de verificación',      cls: 'bg-amber-100 text-amber-700' }
      : { label: 'Preparado (pendiente de Google)', cls: 'bg-amber-100 text-amber-700' }
  } else {
    badge = { label: 'No conectado', cls: 'bg-slate-100 text-slate-500' }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-4">
        {/* Icono del canal */}
        <div className="shrink-0">{icon}</div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{name}</h2>
            <StatusBadge label={badge.label} cls={badge.cls} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>

          {status === 'connected' && integration?.lastVerifiedAt && (
            <p className="mt-3 text-xs text-slate-400">
              Última verificación: {fmtDate(integration.lastVerifiedAt)}
            </p>
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

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Guardia de roles: solo BRANCH_ADMIN y superiores
  useEffect(() => {
    if (!user) return
    const allowed = ['BRANCH_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN']
    if (!allowed.includes(user.role)) {
      router.replace('/dashboard')
    }
  }, [user, router])

  useEffect(() => {
    let alive = true
    apiClient.get<{ data: Integration[] }>('/v1/integrations')
      .then((res) => { if (alive) setIntegrations(res.data) })
      .catch((err: { message?: string }) => { if (alive) setError(err.message ?? 'No se pudo cargar el estado de las integraciones.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integraciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Estado de los canales de comunicación de tu empresa.
        </p>
      </div>

      {/* Nota: la gestión la hace el equipo NEXOR */}
      <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        La conexión de WhatsApp y Gmail la gestiona el equipo NEXOR. Escríbenos para activar,
        cambiar o desconectar un canal.
      </div>

      {/* Error de carga */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tarjetas de estado (solo lectura) */}
      <div className="space-y-4">

        {/* WhatsApp Business */}
        <StatusCard
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
          channel="WHATSAPP"
        />

        {/* Gmail */}
        <StatusCard
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
          channel="GMAIL"
        />
      </div>

      {/* Nota de seguridad */}
      <p className="mt-6 text-center text-xs text-slate-400">
        Tus credenciales se cifran con AES-256 antes de guardarse. NEXOR nunca expone tokens en texto plano.
      </p>
    </div>
  )
}
