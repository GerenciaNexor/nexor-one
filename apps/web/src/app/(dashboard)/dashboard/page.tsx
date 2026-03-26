'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { apiClient } from '@/lib/api-client'

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

function monthRange() {
  const now   = new Date()
  const from  = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt   = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(now) }
}

function fmtCurrency(n: number) {
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

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:  'Super Admin',
  TENANT_ADMIN: 'Administrador',
  AREA_MANAGER: 'Jefe de área',
  BRANCH_ADMIN: 'Admin de sucursal',
  OPERATIVE:    'Operativo',
}

const NOTIF_ICONS: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  STOCK_CRITICO: {
    color: 'text-red-600', bg: 'bg-red-50',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  REABASTECIMIENTO_REQUERIDO: {
    color: 'text-amber-600', bg: 'bg-amber-50',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  },
  ENTREGA_VENCIDA: {
    color: 'text-orange-600', bg: 'bg-orange-50',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  },
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StockAlert  { productId: string; productName: string; sku: string; branchName: string; currentQty: number; minQty: number; deficit: number }
interface POItem      { id: string; orderNumber: string; supplier: { name: string } | null; total: number; expectedDelivery: string | null; createdAt: string }
interface Notification { id: string; type: string; title: string; message: string; link: string | null; createdAt: string }
interface Supplier    { supplierId: string; supplierName: string; overallScore: number | null }

// ─── Componentes internos ─────────────────────────────────────────────────────

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-blue-600 hover:underline">{linkLabel ?? 'Ver todo'}</Link>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      {text}
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 7 ? 'bg-emerald-500' : score >= 4 ? 'bg-amber-400' : 'bg-red-400'
  const textColor = score >= 7 ? 'text-emerald-700' : score >= 4 ? 'text-amber-700' : 'text-red-600'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(score / 10) * 100}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{score.toFixed(1)}</span>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  // KPIs
  const [totalProducts,  setTotalProducts]  = useState<number | null>(null)
  const [totalSuppliers, setTotalSuppliers] = useState<number | null>(null)
  const [monthlySpend,   setMonthlySpend]   = useState<number | null>(null)
  const [unreadCount,    setUnreadCount]    = useState<number | null>(null)

  // Listas operacionales
  const [stockAlerts,   setStockAlerts]   = useState<StockAlert[]>([])
  const [pendingPOs,    setPendingPOs]    = useState<POItem[]>([])
  const [draftPOs,      setDraftPOs]      = useState<POItem[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [topSuppliers,  setTopSuppliers]  = useState<Supplier[]>([])

  useEffect(() => {
    const { from, to } = monthRange()

    // KPIs
    apiClient.get<{ total: number }>('/v1/kira/products?pageSize=1')
      .then((r) => setTotalProducts(r.total)).catch(() => setTotalProducts(0))

    apiClient.get<{ total: number }>('/v1/nira/suppliers?limit=1')
      .then((r) => setTotalSuppliers(r.total)).catch(() => setTotalSuppliers(0))

    apiClient.get<{ grandTotal: number }>(`/v1/nira/reports/costs?from=${from}&to=${to}`)
      .then((r) => setMonthlySpend(r.grandTotal)).catch(() => setMonthlySpend(0))

    apiClient.get<{ count: number }>('/v1/notifications/unread-count')
      .then((r) => setUnreadCount(r.count)).catch(() => setUnreadCount(0))

    // Listas operacionales
    apiClient.get<{ data: StockAlert[] }>('/v1/kira/alerts/stock')
      .then((r) => setStockAlerts(r.data.slice(0, 5))).catch(() => setStockAlerts([]))

    apiClient.get<{ data: POItem[] }>('/v1/nira/purchase-orders?status=pending_approval')
      .then((r) => setPendingPOs(r.data.slice(0, 4))).catch(() => setPendingPOs([]))

    apiClient.get<{ data: POItem[] }>('/v1/nira/purchase-orders?status=draft')
      .then((r) => setDraftPOs(r.data.slice(0, 4))).catch(() => setDraftPOs([]))

    apiClient.get<{ data: Notification[] }>('/v1/notifications?isRead=false&limit=6')
      .then((r) => setNotifications(r.data)).catch(() => setNotifications([]))

    apiClient.get<{ data: Supplier[] }>('/v1/nira/reports/suppliers-ranking')
      .then((r) => setTopSuppliers(r.data.slice(0, 5))).catch(() => setTopSuppliers([]))
  }, [])

  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? ''

  return (
    <div className="p-6">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 capitalize">{todayLabel()}</p>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900">
            {greeting()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{user?.tenant.name}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {roleLabel}
        </span>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Productos en catálogo', value: totalProducts, sub: 'productos activos',
            bg: 'bg-blue-50', stroke: '#2563eb',
            path: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>,
          },
          {
            label: 'Proveedores activos', value: totalSuppliers, sub: 'registrados en NIRA',
            bg: 'bg-violet-50', stroke: '#7c3aed',
            path: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
          },
          {
            label: 'Compras este mes', value: monthlySpend !== null ? fmtCurrency(monthlySpend) : null, sub: 'en OC aprobadas/recibidas',
            bg: 'bg-emerald-50', stroke: '#059669',
            path: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
            raw: true,
          },
          {
            label: 'Alertas pendientes', value: unreadCount, sub: 'notificaciones sin leer',
            bg: unreadCount ? 'bg-red-50' : 'bg-slate-50',
            stroke: unreadCount ? '#dc2626' : '#94a3b8',
            path: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kpi.bg}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={kpi.stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {kpi.path}
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{kpi.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-slate-900">
                {'raw' in kpi && kpi.raw
                  ? (kpi.value === null ? <span className="text-slate-300 text-lg">—</span> : kpi.value)
                  : (kpi.value === null ? <span className="text-slate-300 text-lg">—</span> : kpi.value)
                }
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Contenido principal ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ─ Columna izquierda: requiere acción ──────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Stock crítico */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionHeader title="Stock crítico" href="/kira/stock" linkLabel="Ver stock completo" />
            {stockAlerts.length === 0
              ? <EmptyState text="Todos los productos están sobre el stock mínimo" />
              : (
                <div className="divide-y divide-slate-50">
                  {stockAlerts.map((a) => (
                    <div key={`${a.productId}-${a.branchName}`} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{a.productName}</p>
                        <p className="text-xs text-slate-400">{a.sku} · {a.branchName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                          {a.currentQty} / {a.minQty} mín.
                        </span>
                        <p className="mt-0.5 text-[10px] text-red-400">faltan {a.deficit} uds.</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* OC pendientes de aprobación */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionHeader title="Órdenes en aprobación" href="/nira/purchase-orders?status=pending_approval" />
            {pendingPOs.length === 0
              ? <EmptyState text="No hay órdenes pendientes de aprobación" />
              : (
                <div className="divide-y divide-slate-50">
                  {pendingPOs.map((po) => (
                    <Link
                      key={po.id}
                      href={`/nira/purchase-orders/${po.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 hover:opacity-75 transition-opacity"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-slate-600">{po.orderNumber}</p>
                        <p className="text-sm text-slate-500">{po.supplier?.name ?? 'Sin proveedor'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-900">{fmtCurrency(po.total)}</p>
                        <p className="text-xs text-slate-400">{timeAgo(po.createdAt)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            }
          </div>

          {/* Borradores */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionHeader title="Borradores sin enviar" href="/nira/purchase-orders?status=draft" />
            {draftPOs.length === 0
              ? <EmptyState text="No hay órdenes en borrador" />
              : (
                <div className="divide-y divide-slate-50">
                  {draftPOs.map((po) => (
                    <Link
                      key={po.id}
                      href={`/nira/purchase-orders/${po.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 hover:opacity-75 transition-opacity"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-slate-600">{po.orderNumber}</p>
                        <p className="text-sm text-slate-500">{po.supplier?.name ?? <span className="italic text-slate-400">Sin proveedor</span>}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-900">{fmtCurrency(po.total)}</p>
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Borrador</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            }
          </div>
        </div>

        {/* ─ Columna derecha ──────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Notificaciones recientes */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionHeader title="Alertas recientes" href="/dashboard" linkLabel={unreadCount ? `${unreadCount} sin leer` : undefined} />
            {notifications.length === 0
              ? <EmptyState text="Sin notificaciones pendientes" />
              : (
                <div className="space-y-2">
                  {notifications.map((n) => {
                    const style = NOTIF_ICONS[n.type] ?? { color: 'text-slate-500', bg: 'bg-slate-50', icon: null }
                    return (
                      <div key={n.id} className={`flex gap-3 rounded-lg p-3 ${style.bg}`}>
                        <div className={`mt-0.5 shrink-0 ${style.color}`}>{style.icon}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 line-clamp-2">{n.message}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>

          {/* Ranking proveedores */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionHeader title="Top proveedores" href="/nira/ranking" />
            {topSuppliers.length === 0
              ? <EmptyState text="No hay proveedores con score calculado" />
              : (
                <div className="space-y-3">
                  {topSuppliers.map((s, i) => (
                    <div key={s.supplierId} className="flex items-center gap-3">
                      <span className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        i === 0 ? 'bg-yellow-100 text-yellow-700'
                        : i === 1 ? 'bg-slate-100 text-slate-500'
                        : i === 2 ? 'bg-orange-100 text-orange-600'
                        : 'bg-slate-50 text-slate-400',
                      ].join(' ')}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">{s.supplierName}</p>
                        {s.overallScore != null && <ScoreBar score={s.overallScore} />}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Accesos rápidos */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Accesos rápidos</h2>
            <div className="space-y-1">
              {[
                { href: '/kira/products',       label: 'Catálogo de productos',      color: 'text-blue-600' },
                { href: '/kira/stock',           label: 'Control de stock',           color: 'text-blue-600' },
                { href: '/kira/movements',       label: 'Movimientos de inventario',  color: 'text-blue-600' },
                { href: '/nira/purchase-orders', label: 'Órdenes de compra',          color: 'text-violet-600' },
                { href: '/nira/suppliers',       label: 'Proveedores',                color: 'text-violet-600' },
                { href: '/nira/compare',         label: 'Comparador de precios',      color: 'text-violet-600' },
                { href: '/nira/reports',         label: 'Reportes de costos',         color: 'text-violet-600' },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50 ${l.color}`}
                >
                  {l.label}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
