'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { apiClient } from '@/lib/api-client'
import { getCache, setCache } from '@/lib/page-cache'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'ahora mismo'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:  'Super Admin',
  TENANT_ADMIN: 'Administrador',
  AREA_MANAGER: 'Jefe de área',
  BRANCH_ADMIN: 'Admin de sucursal',
  OPERATIVE:    'Operativo',
}

const NOTIF_ICONS: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  STOCK_CRITICO: {
    color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  REABASTECIMIENTO_REQUERIDO: {
    color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  },
  ENTREGA_VENCIDA: {
    color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  },
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface POItem        { id: string; orderNumber: string; supplier: { name: string } | null; total: number; createdAt: string }
interface StockAlert    { productId: string; productName: string; sku: string; branchName: string; currentQty: number; minQty: number; deficit: number }
interface NotificationItem { id: string; type: string; title: string; message: string; link: string | null; createdAt: string }
interface Appointment   { id: string; clientName: string | null; client: { name: string } | null; serviceType: { name: string } | null; startAt: string; status: string }

// ─── Componentes internos ─────────────────────────────────────────────────────

function SectionHeader({ title, count, href, linkLabel }: { title: string; count?: number; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}
        {count != null && count > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-100 px-1.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{count}</span>
        )}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-blue-600 hover:underline dark:text-blue-400">{linkLabel ?? 'Ver todo'}</Link>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      {text}
    </div>
  )
}

function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  )
}

const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Agendada',  cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  confirmed: { label: 'Confirmada', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
}

// ─── Panel de uso del plan DEMO (HU-143) ───────────────────────────────────────
// Refleja el uso actual vs. los topes validados en el backend ("12 de 40 productos").
// Solo aparece para tenants en modo demo; para el resto el endpoint devuelve isDemo:false.

interface DemoUsageEntry { limit: number; used: number; remaining: number }
interface DemoUsageResponse {
  isDemo: boolean
  status?: 'active' | 'expired'
  daysRemaining?: number
  bulkUploadEnabled?: boolean
  labels?: Record<string, string>
  usage?: Record<string, DemoUsageEntry>
}

// Orden estable de las entidades en el panel.
const DEMO_ENTITY_ORDER = ['products', 'clients', 'suppliers', 'quotes', 'purchaseOrders', 'users', 'appointments']

function DemoUsageBanner() {
  const [data, setData] = useState<DemoUsageResponse | null>(null)

  useEffect(() => {
    apiClient.get<DemoUsageResponse>('/v1/tenants/demo-usage')
      .then(setData)
      .catch(() => { /* silencioso: si falla, no se muestra el panel */ })
  }, [])

  if (!data || !data.isDemo || !data.usage) return null
  const usage = data.usage
  const labels = data.labels ?? {}
  const keys = DEMO_ENTITY_ORDER.filter((k) => usage[k])

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-500/30 dark:bg-violet-500/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">Plan demo</span>
          {data.status === 'active'
            ? <span className="text-xs font-medium text-violet-700 dark:text-violet-300">{data.daysRemaining} día{data.daysRemaining === 1 ? '' : 's'} restante{data.daysRemaining === 1 ? '' : 's'}</span>
            : <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Demo vencida</span>}
        </div>
        <span className="text-xs text-violet-700/80 dark:text-violet-300/80">Carga masiva deshabilitada en demo</span>
      </div>
      <p className="mb-3 text-xs text-violet-800/80 dark:text-violet-200/80">
        Prueba con tus propios datos hasta estos topes. Al alcanzar un límite, la creación se bloquea.
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {keys.map((k) => {
          const u = usage[k]!
          const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0
          const full = u.used >= u.limit
          const near = !full && pct >= 80
          const barCls = full ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-violet-500'
          const numCls = full ? 'text-red-700 dark:text-red-300' : near ? 'text-amber-700 dark:text-amber-300' : 'text-violet-800 dark:text-violet-200'
          return (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium capitalize text-violet-900 dark:text-violet-100">{labels[k] ?? k}</span>
                <span className={`text-xs font-semibold tabular-nums ${numCls}`}>{u.used} de {u.limit}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-200/70 dark:bg-white/10">
                <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página: Inicio (lo accionable del día) ─────────────────────────────────────
// HU-132 — el Inicio muestra lo que requiere atención HOY; las métricas y tendencias
// viven en el Dashboard (/analitica). Cada bloque se construye solo sobre endpoints
// que el rol/módulo del usuario puede consultar (no se piden los que darían 403).

export default function InicioPage() {
  const user        = useAuthStore((s) => s.user)
  const role        = user?.role ?? ''
  const isAdmin     = role === 'TENANT_ADMIN' || role === 'BRANCH_ADMIN' || role === 'SUPER_ADMIN'
  const userModule  = user?.module ?? null
  const roleLabel   = ROLE_LABELS[role] ?? role

  // Módulos activos del tenant (cacheados — mismo origen que el sidebar).
  const [flags, setFlags] = useState<Record<string, boolean>>(() => getCache<Record<string, boolean>>('feature-flags') ?? {})

  // Datos (null = cargando, [] = vacío honesto)
  const [pendingPOs,    setPendingPOs]    = useState<POItem[] | null>(null)
  const [draftPOs,      setDraftPOs]      = useState<POItem[] | null>(null)
  const [stockAlerts,   setStockAlerts]   = useState<StockAlert[] | null>(null)
  const [appointments,  setAppointments]  = useState<Appointment[] | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null)

  // Un usuario AREA_MANAGER/OPERATIVE solo ve SU módulo; los admins son transversales.
  // Siempre exige que el módulo esté activo en el tenant (feature-flags).
  function canSee(mod: string): boolean {
    if (!flags[mod]) return false
    if (isAdmin) return true
    return userModule === mod
  }

  const seeNIRA   = canSee('NIRA')
  const seeKIRA   = canSee('KIRA')
  const seeAGENDA = canSee('AGENDA')

  // Feature-flags (una vez)
  useEffect(() => {
    apiClient.get<Record<string, boolean>>('/v1/tenants/feature-flags')
      .then((f) => { setFlags(f); setCache('feature-flags', f) })
      .catch(() => {})
  }, [])

  // Notificaciones sin leer (universal — no depende de módulo)
  useEffect(() => {
    apiClient.get<{ data: NotificationItem[] }>('/v1/notifications?isRead=false&limit=6')
      .then((r) => setNotifications(r.data)).catch(() => setNotifications([]))
  }, [])

  // NIRA — órdenes esperando aprobación + borradores sin enviar
  useEffect(() => {
    if (!seeNIRA) { setPendingPOs([]); setDraftPOs([]); return }
    apiClient.get<{ data: POItem[] }>('/v1/nira/purchase-orders?status=submitted')
      .then((r) => setPendingPOs(r.data.slice(0, 5))).catch(() => setPendingPOs([]))
    apiClient.get<{ data: POItem[] }>('/v1/nira/purchase-orders?status=draft')
      .then((r) => setDraftPOs(r.data.slice(0, 5))).catch(() => setDraftPOs([]))
  }, [seeNIRA])

  // KIRA — stock crítico (endpoint correcto: /v1/kira/alerts → { critical })
  useEffect(() => {
    if (!seeKIRA) { setStockAlerts([]); return }
    apiClient.get<{ critical: StockAlert[] }>('/v1/kira/alerts')
      .then((r) => setStockAlerts((r.critical ?? []).slice(0, 6))).catch(() => setStockAlerts([]))
  }, [seeKIRA])

  // AGENDA — citas de hoy (agendadas/confirmadas)
  useEffect(() => {
    if (!seeAGENDA) { setAppointments([]); return }
    apiClient.get<{ data: Appointment[] }>(`/v1/agenda/appointments?date=${todayISO()}`)
      .then((r) => {
        const upcoming = r.data
          .filter((a) => a.status === 'scheduled' || a.status === 'confirmed')
          .sort((a, b) => a.startAt.localeCompare(b.startAt))
        setAppointments(upcoming.slice(0, 6))
      })
      .catch(() => setAppointments([]))
  }, [seeAGENDA])

  // Accesos rápidos — solo a los módulos que el usuario puede ver
  const quickLinks: { href: string; label: string; color: string }[] = []
  if (seeKIRA)        quickLinks.push({ href: '/kira/stock',           label: 'Control de stock',      color: 'text-blue-600 dark:text-blue-400' }, { href: '/kira/products', label: 'Catálogo de productos', color: 'text-blue-600 dark:text-blue-400' })
  if (seeNIRA)        quickLinks.push({ href: '/nira/purchase-orders', label: 'Órdenes de compra',     color: 'text-violet-600 dark:text-violet-400' }, { href: '/nira/suppliers', label: 'Proveedores', color: 'text-violet-600 dark:text-violet-400' })
  if (canSee('ARI'))  quickLinks.push({ href: '/ari/pipeline',         label: 'Pipeline de ventas',    color: 'text-emerald-600 dark:text-emerald-400' }, { href: '/ari/clients', label: 'Clientes', color: 'text-emerald-600 dark:text-emerald-400' })
  if (seeAGENDA)      quickLinks.push({ href: '/agenda/appointments',  label: 'Citas',                 color: 'text-orange-600 dark:text-orange-400' })
  if (canSee('VERA')) quickLinks.push({ href: '/vera/transactions',    label: 'Transacciones',         color: 'text-rose-600 dark:text-rose-400' })

  const totalUnread = notifications?.length ?? 0

  return (
    <div className="p-6">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs capitalize text-slate-400 dark:text-slate-500">{todayLabel()}</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-slate-50">
            {greeting()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Esto requiere tu atención hoy.{' '}
            <Link href="/analitica" className="text-blue-600 hover:underline dark:text-blue-400">Ver métricas y tendencias →</Link>
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/30 dark:text-blue-300">
          {roleLabel}
        </span>
      </div>

      {/* Panel de uso del plan demo (HU-143) — solo visible para tenants demo */}
      <DemoUsageBanner />

      {/* ── Contenido principal ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ─ Columna izquierda: requiere acción ──────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Stock crítico (KIRA) */}
          {seeKIRA && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <SectionHeader title="Stock crítico" count={stockAlerts?.length} href="/kira/stock" linkLabel="Ver stock" />
              {stockAlerts === null ? <BlockSkeleton />
                : stockAlerts.length === 0 ? <EmptyState text="Todos los productos están sobre el stock mínimo" />
                : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
                    {stockAlerts.map((a) => (
                      <Link key={`${a.productId}-${a.branchName}`} href="/kira/stock" className="flex items-center justify-between gap-4 py-2.5 transition-opacity hover:opacity-75">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{a.productName}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{a.sku} · {a.branchName}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-300">
                            {a.currentQty} / {a.minQty} mín.
                          </span>
                          <p className="mt-0.5 text-[10px] text-red-400">faltan {a.deficit} uds.</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* OC esperando aprobación (NIRA) */}
          {seeNIRA && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <SectionHeader title="Órdenes esperando aprobación" count={pendingPOs?.length} href="/nira/purchase-orders?status=submitted" />
              {pendingPOs === null ? <BlockSkeleton />
                : pendingPOs.length === 0 ? <EmptyState text="No hay órdenes pendientes de aprobación" />
                : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
                    {pendingPOs.map((po) => (
                      <Link key={po.id} href={`/nira/purchase-orders/${po.id}`} className="flex items-center justify-between gap-4 py-2.5 transition-opacity hover:opacity-75">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{po.orderNumber}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{po.supplier?.name ?? 'Sin proveedor'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(po.total)}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(po.createdAt)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Borradores sin enviar (NIRA) */}
          {seeNIRA && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <SectionHeader title="Borradores sin enviar" count={draftPOs?.length} href="/nira/purchase-orders?status=draft" />
              {draftPOs === null ? <BlockSkeleton />
                : draftPOs.length === 0 ? <EmptyState text="No hay órdenes en borrador" />
                : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
                    {draftPOs.map((po) => (
                      <Link key={po.id} href={`/nira/purchase-orders/${po.id}`} className="flex items-center justify-between gap-4 py-2.5 transition-opacity hover:opacity-75">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{po.orderNumber}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{po.supplier?.name ?? <span className="italic text-slate-400">Sin proveedor</span>}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(po.total)}</p>
                          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">Borrador</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Citas de hoy (AGENDA) */}
          {seeAGENDA && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <SectionHeader title="Citas de hoy" count={appointments?.length} href="/agenda/appointments" linkLabel="Ver agenda" />
              {appointments === null ? <BlockSkeleton />
                : appointments.length === 0 ? <EmptyState text="No hay citas agendadas para hoy" />
                : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700/60">
                    {appointments.map((a) => {
                      const st = APPT_STATUS[a.status] ?? { label: a.status, cls: 'bg-slate-50 text-slate-500' }
                      return (
                        <Link key={a.id} href="/agenda/appointments" className="flex items-center justify-between gap-4 py-2.5 transition-opacity hover:opacity-75">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{a.clientName ?? a.client?.name ?? 'Cliente'}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{a.serviceType?.name ?? 'Servicio'}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmtTime(a.startAt)}</p>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* ─ Columna derecha ──────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Notificaciones sin leer (universal) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <SectionHeader title="Notificaciones sin leer" count={totalUnread} href="/notifications" linkLabel="Ver todas" />
            {notifications === null ? <BlockSkeleton />
              : notifications.length === 0 ? <EmptyState text="Sin notificaciones pendientes" />
              : (
                <div className="space-y-2">
                  {notifications.map((n) => {
                    const style = NOTIF_ICONS[n.type] ?? { color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-700/40', icon: null }
                    const body = (
                      <div className={`flex gap-3 rounded-lg p-3 ${style.bg}`}>
                        <div className={`mt-0.5 shrink-0 ${style.color}`}>{style.icon}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{n.message}</p>
                          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    )
                    return n.link
                      ? <Link key={n.id} href={n.link} className="block transition-opacity hover:opacity-80">{body}</Link>
                      : <div key={n.id}>{body}</div>
                  })}
                </div>
              )}
          </div>

          {/* Accesos rápidos — solo módulos accesibles */}
          {quickLinks.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Accesos rápidos</h2>
              <div className="space-y-1">
                {quickLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${l.color}`}
                  >
                    {l.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
