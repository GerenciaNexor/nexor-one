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
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:  'Super Admin',
  TENANT_ADMIN: 'Administrador',
  AREA_MANAGER: 'Jefe de área',
  BRANCH_ADMIN: 'Admin de sucursal',
  OPERATIVE:    'Operativo',
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string
  value: number | null
  sub:   string
  color: string
  icon:  React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">
          {value === null ? <span className="text-slate-300 text-lg">—</span> : value}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  )
}

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({
  href,
  title,
  description,
  badge,
  badgeColor,
  icon,
  accentColor,
}: {
  href:        string
  title:       string
  description: string
  badge:       string
  badgeColor:  string
  icon:        React.ReactNode
  accentColor: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 transition-all duration-150 hover:border-slate-300 hover:shadow-md"
    >
      <div>
        <div className={`mb-3 inline-flex items-center justify-center rounded-lg p-2.5 ${accentColor}`}>
          {icon}
        </div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeColor}`}>
            {badge}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      <div className="flex items-center gap-1 text-sm font-medium text-blue-600 transition-colors group-hover:text-blue-700">
        Ir al módulo
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </div>
    </Link>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const [products,        setProducts]        = useState<number | null>(null)
  const [suppliers,       setSuppliers]       = useState<number | null>(null)
  const [pendingApproval, setPendingApproval] = useState<number | null>(null)
  const [drafts,          setDrafts]          = useState<number | null>(null)

  useEffect(() => {
    apiClient.get<{ total: number }>('/v1/kira/products?pageSize=1')
      .then((r) => setProducts(r.total)).catch(() => setProducts(0))

    apiClient.get<{ total: number }>('/v1/nira/suppliers?limit=1')
      .then((r) => setSuppliers(r.total)).catch(() => setSuppliers(0))

    apiClient.get<{ total: number }>('/v1/nira/purchase-orders?status=pending_approval')
      .then((r) => setPendingApproval(r.total)).catch(() => setPendingApproval(0))

    apiClient.get<{ total: number }>('/v1/nira/purchase-orders?status=draft')
      .then((r) => setDrafts(r.total)).catch(() => setDrafts(0))
  }, [])

  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? ''

  return (
    <div className="p-6 max-w-5xl">

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">{todayLabel()}</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-900">
              {greeting()}, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {user?.tenant.name}
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {roleLabel}
          </span>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Productos"
          value={products}
          sub="en el catálogo"
          color="bg-blue-50"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          }
        />
        <KpiCard
          label="Proveedores"
          value={suppliers}
          sub="activos registrados"
          color="bg-violet-50"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }
        />
        <KpiCard
          label="En aprobación"
          value={pendingApproval}
          sub="órdenes de compra"
          color="bg-amber-50"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          }
        />
        <KpiCard
          label="Borradores"
          value={drafts}
          sub="órdenes sin enviar"
          color="bg-slate-100"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          }
        />
      </div>

      {/* ── Módulos ───────────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Módulos disponibles
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ModuleCard
            href="/kira/products"
            title="Inventario (KIRA)"
            description="Gestiona el catálogo de productos, controla el stock por sucursal, registra movimientos de entrada y salida, y visualiza alertas de stock crítico."
            badge="KIRA"
            badgeColor="bg-blue-100 text-blue-700"
            accentColor="bg-blue-50"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            }
          />
          <ModuleCard
            href="/nira/suppliers"
            title="Compras (NIRA)"
            description="Administra proveedores, crea y aprueba órdenes de compra, compara precios históricos y consulta el ranking de proveedores por score de desempeño."
            badge="NIRA"
            badgeColor="bg-violet-100 text-violet-700"
            accentColor="bg-violet-50"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            }
          />
        </div>
      </div>
    </div>
  )
}
