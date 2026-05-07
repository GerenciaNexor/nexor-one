'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Conversation {
  id:               string
  channel:          'WHATSAPP' | 'GMAIL'
  senderIdentifier: string
  senderName:       string | null
  relatedModule:    string | null
  status:           'open' | 'replied' | 'resolved' | 'reassigned'
  assignedTo:       string | null
  lastMessageAt:    string
  createdAt:        string
  assignedUser:     { id: string; name: string } | null
  messageCount:     number
}

interface Message {
  id:                string
  direction:         'inbound' | 'outbound'
  content:           string
  messageType:       string
  isFromAgent:       boolean
  userId:            string | null
  externalMessageId: string | null
  timestamp:         string
  createdAt:         string
  user:              { id: string; name: string } | null
}

interface ConversationDetail extends Conversation {
  messages: Message[]
}

interface InboxUser {
  id:     string
  name:   string
  role:   string
  module: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'Ahora mismo'
  if (min < 60) return `Hace ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `Hace ${hr} h`
  return `Hace ${Math.floor(hr / 24)} d`
}

function statusInfo(status: string): { label: string; dot: string; bg: string } {
  switch (status) {
    case 'open':       return { label: 'Abierta',    dot: 'bg-amber-500',   bg: 'bg-amber-50  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400'  }
    case 'replied':    return { label: 'Respondida', dot: 'bg-blue-500',    bg: 'bg-blue-50   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400'   }
    case 'resolved':   return { label: 'Resuelta',   dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
    case 'reassigned': return { label: 'Reasignada', dot: 'bg-violet-500',  bg: 'bg-violet-50 text-violet-700  dark:bg-violet-900/30  dark:text-violet-400'  }
    default:           return { label: status,       dot: 'bg-slate-400',   bg: 'bg-slate-100 text-slate-600   dark:bg-slate-700     dark:text-slate-400'  }
  }
}

function contactLabel(conv: Conversation): string {
  return conv.senderName ?? conv.senderIdentifier
}

// ─── Iconos SVG ───────────────────────────────────────────────────────────────

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function GmailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.910 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
    </svg>
  )
}

function BotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useAuthStore()

  // ── Estado del panel izquierdo ─────────────────────────────────────────────
  const [channel, setChannel]           = useState<'WHATSAPP' | 'GMAIL'>('WHATSAPP')
  const [statusFilter, setStatusFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [listLoading, setListLoading]   = useState(true)

  // ── Estado del panel derecho ───────────────────────────────────────────────
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [detail, setDetail]                 = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading]   = useState(false)

  // ── Respuesta ──────────────────────────────────────────────────────────────
  const [replyText, setReplyText]   = useState('')
  const [sending, setSending]       = useState(false)
  const [replyError, setReplyError] = useState('')

  // ── Reasignación ──────────────────────────────────────────────────────────
  const [users, setUsers]         = useState<InboxUser[]>([])
  const [assigningTo, setAssigningTo] = useState('')
  const [assigning, setAssigning] = useState(false)

  // ── Mobile view ───────────────────────────────────────────────────────────
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Cargar usuarios para reasignación ──────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ data: InboxUser[] }>('/v1/inbox/users')
      .then((r) => setUsers(r.data))
      .catch(() => {})
  }, [])

  // ── Cargar lista de conversaciones ─────────────────────────────────────────
  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    try {
      const params = new URLSearchParams({ channel, page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      if (moduleFilter) params.set('module', moduleFilter)
      const data = await apiClient.get<{ data: Conversation[]; total: number }>(
        `/v1/inbox?${params.toString()}`
      )
      setConversations(data.data)
      setTotal(data.total)
    } catch {
      // silent
    } finally {
      if (!silent) setListLoading(false)
    }
  }, [channel, page, statusFilter, moduleFilter])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // ── Cargar detalle de conversación ─────────────────────────────────────────
  const fetchDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true)
    try {
      const data = await apiClient.get<ConversationDetail>(`/v1/inbox/${id}`)
      setDetail(data)
    } catch {
      // silent
    } finally {
      if (!silent) setDetailLoading(false)
    }
  }, [])

  // ── Polling cada 15s (pausa si la pestaña está oculta) ────────────────────
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      fetchConversations(true)
      if (selectedId) fetchDetail(selectedId, true)
    }
    const interval = setInterval(tick, 15_000)
    const onVisibility = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchConversations, fetchDetail, selectedId])

  // ── Scroll al último mensaje al abrir el detalle ───────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [detail?.id])

  // ── Acciones ───────────────────────────────────────────────────────────────

  function selectConversation(id: string) {
    setSelectedId(id)
    setMobileView('detail')
    setReplyText('')
    setReplyError('')
    fetchDetail(id)
  }

  async function handleReply() {
    if (!selectedId || !replyText.trim() || sending) return
    setSending(true)
    setReplyError('')
    try {
      await apiClient.post(`/v1/inbox/${selectedId}/reply`, { text: replyText.trim() })
      setReplyText('')
      await Promise.all([fetchDetail(selectedId, true), fetchConversations(true)])
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'INTEGRATION_NOT_ACTIVE') {
        setReplyError('La integración del canal no está activa.')
      } else {
        setReplyError(e.message ?? 'Error al enviar el mensaje')
      }
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(status: 'open' | 'resolved') {
    if (!selectedId) return
    try {
      await apiClient.put(`/v1/inbox/${selectedId}/status`, { status })
      await Promise.all([fetchDetail(selectedId, true), fetchConversations(true)])
    } catch {
      // silent
    }
  }

  async function handleAssign() {
    if (!selectedId || !assigningTo || assigning) return
    setAssigning(true)
    try {
      await apiClient.put(`/v1/inbox/${selectedId}/assign`, { userId: assigningTo })
      setAssigningTo('')
      await Promise.all([fetchDetail(selectedId, true), fetchConversations(true)])
    } catch {
      // silent
    } finally {
      setAssigning(false)
    }
  }

  const isTenantAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN'
  const totalPages = Math.ceil(total / 20)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Panel izquierdo: lista ───────────────────────────────────────── */}
      <div
        className={[
          'flex shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
          'w-full md:w-80',
          mobileView === 'detail' ? 'hidden md:flex' : 'flex',
        ].join(' ')}
      >
        {/* Pestañas de canal */}
        <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-700">
          {(['WHATSAPP', 'GMAIL'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => { setChannel(ch); setPage(1); setSelectedId(null); setDetail(null) }}
              className={[
                'flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
                channel === ch
                  ? 'border-b-2 border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              ].join(' ')}
            >
              <span className={ch === 'WHATSAPP' ? 'text-emerald-600' : 'text-red-500'}>
                {ch === 'WHATSAPP' ? <WhatsAppIcon /> : <GmailIcon />}
              </span>
              <span>{ch === 'WHATSAPP' ? 'WhatsApp' : 'Gmail'}</span>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex shrink-0 gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            <option value="">Todas</option>
            <option value="open">Abiertas</option>
            <option value="replied">Respondidas</option>
            <option value="resolved">Resueltas</option>
            <option value="reassigned">Reasignadas</option>
          </select>

          {isTenantAdmin && (
            <select
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value); setPage(1) }}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              <option value="">Módulos</option>
              <option value="ARI">ARI</option>
              <option value="NIRA">NIRA</option>
              <option value="KIRA">KIRA</option>
              <option value="AGENDA">AGENDA</option>
              <option value="VERA">VERA</option>
            </select>
          )}
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">Sin conversaciones</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {conversations.map((conv) => {
                const si       = statusInfo(conv.status)
                const isOpen   = conv.status === 'open'
                const isActive = conv.id === selectedId
                return (
                  <li key={conv.id}>
                    <button
                      onClick={() => selectConversation(conv.id)}
                      className={[
                        'w-full px-4 py-3 text-left transition-colors',
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : isOpen
                          ? 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar de canal */}
                        <div className={[
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          conv.channel === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : 'bg-red-100 text-red-500 dark:bg-red-900/40',
                        ].join(' ')}>
                          {conv.channel === 'WHATSAPP' ? <WhatsAppIcon size={14} /> : <GmailIcon size={14} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Nombre + tiempo */}
                          <div className="flex items-baseline justify-between gap-1">
                            <span className={[
                              'truncate text-sm font-medium',
                              isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-slate-100',
                            ].join(' ')}>
                              {contactLabel(conv)}
                            </span>
                            <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                              {relativeTime(conv.lastMessageAt)}
                            </span>
                          </div>

                          {/* Conteo + badge de estado */}
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {conv.messageCount} mensajes
                            </span>
                            <span className={[
                              'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              si.bg,
                            ].join(' ')}>
                              <span className={`h-1.5 w-1.5 rounded-full ${si.dot}`} />
                              {si.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-slate-700">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs text-blue-600 disabled:opacity-30 dark:text-blue-400"
            >
              ← Anterior
            </button>
            <span className="text-xs text-slate-400">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs text-blue-600 disabled:opacity-30 dark:text-blue-400"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* ── Panel derecho: detalle ───────────────────────────────────────── */}
      <div
        className={[
          'flex flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900',
          mobileView === 'list' ? 'hidden md:flex' : 'flex',
        ].join(' ')}
      >
        {!selectedId ? (
          /* Estado vacío */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Selecciona una conversación</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Haz clic en un contacto de la lista para ver el hilo</p>
          </div>
        ) : detailLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : detail ? (
          <>
            {/* Cabecera del detalle */}
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              {/* Botón volver (solo mobile) */}
              <button
                onClick={() => setMobileView('list')}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden dark:hover:bg-slate-700"
              >
                <ArrowLeftIcon />
              </button>

              {/* Icono de canal */}
              <div className={[
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                detail.channel === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : 'bg-red-100 text-red-500 dark:bg-red-900/40',
              ].join(' ')}>
                {detail.channel === 'WHATSAPP' ? <WhatsAppIcon size={16} /> : <GmailIcon size={16} />}
              </div>

              {/* Nombre + identificador */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {contactLabel(detail)}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {detail.senderIdentifier}
                  {detail.relatedModule && (
                    <span className="ml-2 font-medium text-slate-500 dark:text-slate-400">
                      · {detail.relatedModule}
                    </span>
                  )}
                </p>
              </div>

              {/* Badge de estado */}
              <span className={[
                'hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex items-center gap-1',
                statusInfo(detail.status).bg,
              ].join(' ')}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusInfo(detail.status).dot}`} />
                {statusInfo(detail.status).label}
              </span>
            </div>

            {/* Barra de acciones */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
              {/* Resolver / Reabrir */}
              {detail.status !== 'resolved' ? (
                <button
                  onClick={() => handleStatusChange('resolved')}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                >
                  Marcar resuelta
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange('open')}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
                >
                  Reabrir
                </button>
              )}

              {/* Asignado a */}
              {detail.assignedUser && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  → {detail.assignedUser.name}
                </span>
              )}

              {/* Reasignar */}
              {users.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <select
                    value={assigningTo}
                    onChange={(e) => setAssigningTo(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  >
                    <option value="">Reasignar a...</option>
                    {users
                      .filter((u) => u.id !== detail.assignedTo)
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))
                    }
                  </select>
                  <button
                    onClick={handleAssign}
                    disabled={!assigningTo || assigning}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  >
                    {assigning ? '...' : 'Asignar'}
                  </button>
                </div>
              )}
            </div>

            {/* Hilo de mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detail.messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400 dark:text-slate-500">Sin mensajes</p>
              ) : (
                <div className="space-y-3">
                  {detail.messages.map((msg) => {
                    if (msg.messageType === 'system') {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            ⚠ {msg.content}
                          </div>
                        </div>
                      )
                    }

                    const isInbound = msg.direction === 'inbound'
                    return (
                      <div
                        key={msg.id}
                        className={['flex gap-2', isInbound ? 'justify-start' : 'justify-end'].join(' ')}
                      >
                        {isInbound && (
                          <div className={[
                            'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                            detail.channel === 'WHATSAPP' ? 'bg-emerald-500' : 'bg-red-500',
                          ].join(' ')}>
                            {(contactLabel(detail)[0] ?? '?').toUpperCase()}
                          </div>
                        )}

                        <div className={['max-w-[72%]', isInbound ? '' : ''].join(' ')}>
                          {/* Indicador de agente / usuario */}
                          {!isInbound && (
                            <div className={[
                              'mb-1 flex items-center gap-1 text-[11px]',
                              'justify-end',
                            ].join(' ')}>
                              {msg.isFromAgent ? (
                                <>
                                  <span className="text-blue-500 dark:text-blue-400"><BotIcon /></span>
                                  <span className="font-medium text-blue-600 dark:text-blue-400">Agente IA</span>
                                </>
                              ) : (
                                <span className="font-medium text-slate-500 dark:text-slate-400">
                                  {msg.user?.name ?? 'Equipo'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Burbuja de mensaje */}
                          <div className={[
                            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                            isInbound
                              ? 'rounded-tl-sm bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                              : msg.isFromAgent
                              ? 'rounded-tr-sm bg-blue-600 text-white'
                              : 'rounded-tr-sm bg-blue-500 text-white',
                          ].join(' ')}>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>

                          {/* Timestamp */}
                          <p className={[
                            'mt-1 text-[11px] text-slate-400 dark:text-slate-500',
                            isInbound ? 'text-left' : 'text-right',
                          ].join(' ')}>
                            {relativeTime(msg.timestamp)}
                          </p>
                        </div>

                        {!isInbound && (
                          <div className={[
                            'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white',
                            msg.isFromAgent
                              ? 'bg-blue-600'
                              : 'bg-slate-500',
                          ].join(' ')}>
                            {msg.isFromAgent
                              ? <BotIcon />
                              : <span className="text-[11px] font-bold">{(msg.user?.name?.[0] ?? 'U').toUpperCase()}</span>
                            }
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Campo de respuesta */}
            <div className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              {detail.status === 'resolved' ? (
                <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                  Esta conversación está resuelta.{' '}
                  <button
                    onClick={() => handleStatusChange('open')}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Reabrir para responder
                  </button>
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply()
                      }}
                      placeholder="Escribe tu respuesta... (Ctrl+Enter para enviar)"
                      rows={3}
                      className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                    <button
                      onClick={handleReply}
                      disabled={!replyText.trim() || sending}
                      className={[
                        'flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-4 py-2 text-white transition-colors disabled:opacity-40',
                        detail.channel === 'WHATSAPP'
                          ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600'
                          : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500',
                      ].join(' ')}
                    >
                      {sending ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <>
                          {detail.channel === 'WHATSAPP' ? <WhatsAppIcon size={18} /> : <GmailIcon size={18} />}
                          <span className="text-[10px] font-semibold">Enviar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {replyError && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {replyError}
                        {replyError.includes('integración') && (
                          <>{' '}<Link href="/settings/integrations" className="font-medium underline">Ir a Integraciones</Link></>
                        )}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
