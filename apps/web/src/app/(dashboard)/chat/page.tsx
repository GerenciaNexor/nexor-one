'use client'

/**
 * Chat IA — HU-057D
 *
 * useChatStore es la fuente de verdad para el historial propio.
 * Supervisión (TENANT_ADMIN) usa estado local sin tocar el store.
 * - Paginación DESC: carga los últimos 50 y permite cargar hacia atrás.
 * - Búsqueda client-side sobre mensajes cargados.
 * - Input sticky al fondo; respuesta en tiempo real sin recargar.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { useChatStore, type ChatMessage, type PaginationMeta } from '@/store/chat'
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface HistoryResponse {
  data:       ChatMessage[]
  pagination: PaginationMeta
}

interface TenantUser {
  id:    string
  name:  string
  email: string
  role:  string
}

const PAGE_LIMIT       = 50
const DEFAULT_PAGINATION: PaginationMeta = { page: 1, pages: 1, total: 0, limit: PAGE_LIMIT }

// ─── Iconos SVG ───────────────────────────────────────────────────────────────

function AgentIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path d="M12 7v2" />
      <rect x="3" y="9" width="18" height="10" rx="3" />
      <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function XIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d       = new Date(iso)
  const today   = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time    = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' · ' + time
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="mb-3 flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <AgentIcon size={14} />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 rounded-full bg-slate-300 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Burbuja de mensaje ───────────────────────────────────────────────────────

function MessageBubble({ msg, highlight }: { msg: ChatMessage; highlight?: string }) {
  const isUser = msg.role === 'user'

  let userContent: React.ReactNode = msg.content
  if (isUser && highlight) {
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts   = msg.content.split(new RegExp(`(${escaped})`, 'gi'))
    userContent   = parts.map((part, i) =>
      part.toLowerCase() === highlight.toLowerCase()
        ? <mark key={i} className="rounded bg-yellow-200 text-slate-900">{part}</mark>
        : part,
    )
  }

  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'} items-end gap-2`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <AgentIcon size={14} />
        </div>
      )}
      <div className={`flex max-w-[70%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={[
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-br-sm bg-blue-600 text-white'
              : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm',
          ].join(' ')}
        >
          {isUser ? userContent : <MarkdownMessage content={msg.content} />}
        </div>
        <span className="text-[11px] text-slate-400">
          {formatTimestamp(msg.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ChatPage() {
  const { user } = useAuthStore()
  const {
    messages:      storeMessages,
    isTyping:      storeIsTyping,
    historyLoaded,
    pagination:    storePagination,
    addMessage,
    setMessages,
    prependMessages,
    setTyping,
    setHistoryLoaded,
    setPagination,
    clearUnread,
  } = useChatStore()

  const isAdmin = user?.role === 'TENANT_ADMIN'

  // ── Carga inicial del historial propio ───────────────────────────────────────
  // Inicia en false si el store ya tiene datos (FloatingChat los cargó antes)
  const [initialLoading,  setInitialLoading]  = useState(() => !useChatStore.getState().historyLoaded)
  const [loadingMore,     setLoadingMore]     = useState(false)

  // ── Búsqueda ─────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')

  // ── Supervisión admin (local — no afecta el store) ───────────────────────────
  const [tenantUsers,   setTenantUsers]   = useState<TenantUser[]>([])
  const [viewingUserId, setViewingUserId] = useState('')
  const isSupervising = isAdmin && viewingUserId !== '' && viewingUserId !== user?.id
  const viewedUser    = tenantUsers.find((u) => u.id === viewingUserId)

  const [supervisionMessages,    setSupervisionMessages]    = useState<ChatMessage[]>([])
  const [supervisionPagination,  setSupervisionPagination]  = useState<PaginationMeta>(DEFAULT_PAGINATION)
  const [supervisionLoading,     setSupervisionLoading]     = useState(false)
  const [supervisionLoadingMore, setSupervisionLoadingMore] = useState(false)

  // ── Derivados: qué fuente de datos usar ──────────────────────────────────────
  const messages        = isSupervising ? supervisionMessages  : storeMessages
  const pagination      = isSupervising ? supervisionPagination : (storePagination ?? DEFAULT_PAGINATION)
  const loading         = isSupervising ? supervisionLoading   : initialLoading
  const isTyping        = isSupervising ? false                : storeIsTyping
  const loadingMoreNow  = isSupervising ? supervisionLoadingMore : loadingMore

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const isSendingRef     = useRef(false)
  const messagesEndRef   = useRef<HTMLDivElement>(null)
  const inputRef         = useRef<HTMLTextAreaElement>(null)
  const didInitialScroll = useRef(false)

  function getScrollContainer(): HTMLElement | null {
    return document.querySelector('main')
  }

  // ── Limpiar badge al abrir ───────────────────────────────────────────────────
  useEffect(() => {
    clearUnread()
  }, [clearUnread])

  // ── Cargar historial propio al montar (una sola vez) ─────────────────────────
  useEffect(() => {
    if (historyLoaded) {
      setInitialLoading(false)
      return
    }
    apiClient
      .get<HistoryResponse>(`/v1/chat/history?limit=${PAGE_LIMIT}&sort=desc`)
      .then((res) => {
        setMessages([...res.data].reverse())
        setPagination(res.pagination)
        setHistoryLoaded(true)
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Cargar usuarios del tenant para admin ────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return
    apiClient
      .get<{ data: TenantUser[] }>('/v1/users?limit=100')
      .then((r) => setTenantUsers(r.data))
      .catch(() => {})
  }, [isAdmin])

  // ── Supervisión: recargar al cambiar usuario ──────────────────────────────────
  useEffect(() => {
    setSearch('')
    didInitialScroll.current = false

    if (!isSupervising) return

    setSupervisionMessages([])
    setSupervisionPagination(DEFAULT_PAGINATION)
    setSupervisionLoading(true)

    apiClient
      .get<HistoryResponse>(`/v1/chat/history/${viewingUserId}?limit=${PAGE_LIMIT}&sort=desc`)
      .then((res) => {
        setSupervisionMessages([...res.data].reverse())
        setSupervisionPagination(res.pagination)
      })
      .catch(() => {})
      .finally(() => setSupervisionLoading(false))
  }, [viewingUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll al fondo tras carga inicial ──────────────────────────────────────
  useEffect(() => {
    if (!loading && !didInitialScroll.current && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView()
      didInitialScroll.current = true
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [loading, messages.length])

  // ── Scroll al fondo al escribir / responder ──────────────────────────────────
  useEffect(() => {
    if (isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isTyping, messages.length])

  // ── Enviar mensaje ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (isSendingRef.current || isSupervising) return
    const text = inputRef.current?.value.trim()
    if (!text) return

    isSendingRef.current = true
    if (inputRef.current) inputRef.current.value = ''

    addMessage({
      id:        `tmp-${Date.now()}`,
      role:      'user',
      content:   text,
      createdAt: new Date().toISOString(),
    })
    setTyping(true)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const res = await apiClient.post<{ reply: string; module: string }>(
        '/v1/chat/message',
        { message: text },
      )
      addMessage({
        id:        `tmp-${Date.now()}-a`,
        role:      'assistant',
        content:   res.reply,
        module:    res.module,
        createdAt: new Date().toISOString(),
      })
    } catch {
      addMessage({
        id:        `tmp-${Date.now()}-err`,
        role:      'assistant',
        content:   'No pude procesar tu mensaje. Inténtalo de nuevo.',
        createdAt: new Date().toISOString(),
      })
    } finally {
      setTyping(false)
      isSendingRef.current = false
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        inputRef.current?.focus()
      }, 50)
    }
  }, [isSupervising, addMessage, setTyping])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // ── Cargar mensajes anteriores ───────────────────────────────────────────────
  async function handleLoadMore() {
    if (loadingMoreNow) return

    const container  = getScrollContainer()
    const prevHeight = container?.scrollHeight ?? 0
    const restoreScroll = () =>
      requestAnimationFrame(() => {
        if (container) container.scrollTop += container.scrollHeight - prevHeight
      })

    if (isSupervising) {
      if (supervisionPagination.page >= supervisionPagination.pages) return
      setSupervisionLoadingMore(true)
      try {
        const res = await apiClient.get<HistoryResponse>(
          `/v1/chat/history/${viewingUserId}?limit=${PAGE_LIMIT}&sort=desc&page=${supervisionPagination.page + 1}`,
        )
        setSupervisionMessages((prev) => [...[...res.data].reverse(), ...prev])
        setSupervisionPagination(res.pagination)
        restoreScroll()
      } catch { /* silent */ }
      finally { setSupervisionLoadingMore(false) }
    } else {
      if (!storePagination || storePagination.page >= storePagination.pages) return
      setLoadingMore(true)
      try {
        const res = await apiClient.get<HistoryResponse>(
          `/v1/chat/history?limit=${PAGE_LIMIT}&sort=desc&page=${storePagination.page + 1}`,
        )
        prependMessages([...res.data].reverse())
        setPagination(res.pagination)
        restoreScroll()
      } catch { /* silent */ }
      finally { setLoadingMore(false) }
    }
  }

  // ── Filtro de búsqueda (client-side) ─────────────────────────────────────────
  const displayMessages = search.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(search.toLowerCase()))
    : messages

  const canLoadMore = !search.trim() && pagination.page < pagination.pages

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-col">

      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">

        {/* Fila principal */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Título */}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-slate-900">Chat IA</h1>
            <p className="text-xs text-slate-500">
              {loading
                ? 'Cargando…'
                : pagination.total === 0
                  ? 'Sin conversaciones'
                  : `${pagination.total} mensaje${pagination.total !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Buscador */}
          <div className="relative w-full sm:w-56">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en el historial…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-7 text-sm focus:border-blue-500 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>

          {/* Selector de usuario (solo TENANT_ADMIN) */}
          {isAdmin && tenantUsers.length > 0 && (
            <select
              value={viewingUserId}
              onChange={(e) => setViewingUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none sm:w-auto"
            >
              <option value="">Mi historial</option>
              {tenantUsers
                .filter((u) => u.id !== user?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          )}
        </div>

        {/* Banner de supervisión */}
        {isSupervising && viewedUser && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="shrink-0 text-amber-600">
              <EyeIcon />
            </span>
            <p className="text-xs font-medium text-amber-700">
              Modo supervisión — historial de{' '}
              <strong>{viewedUser.name}</strong> ({viewedUser.email}).
              Solo lectura.
            </p>
          </div>
        )}

        {/* Aviso de búsqueda parcial */}
        {search.trim() && pagination.pages > 1 && (
          <p className="mt-2 text-xs text-slate-400">
            Buscando en los {messages.length} mensajes cargados. Carga mensajes anteriores para ampliar la búsqueda.
          </p>
        )}
      </div>

      {/* ── Lista de mensajes ────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-5 sm:px-6">
        {/* Botón "cargar anteriores" */}
        {canLoadMore && !loading && (
          <div className="mb-5 flex justify-center">
            <button
              onClick={() => void handleLoadMore()}
              disabled={loadingMoreNow}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMoreNow
                ? 'Cargando…'
                : `Cargar mensajes anteriores (${(pagination.pages - pagination.page) * PAGE_LIMIT}+)`}
            </button>
          </div>
        )}

        {/* Estado de carga */}
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>

        ) : displayMessages.length === 0 ? (
          /* Estado vacío */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {search ? (
              <>
                <p className="text-sm font-medium text-slate-700">Sin resultados</p>
                <p className="mt-1 text-xs text-slate-400">
                  No hay mensajes que contengan &ldquo;{search}&rdquo;
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  <AgentIcon size={22} />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {isSupervising ? 'Este usuario no tiene conversaciones' : 'Sin conversaciones aún'}
                </p>
                {!isSupervising && (
                  <p className="mt-1 max-w-xs text-xs text-slate-400">
                    Escribe un mensaje para comenzar. El agente responde según tu módulo asignado.
                  </p>
                )}
              </>
            )}
          </div>

        ) : (
          /* Burbujas */
          <>
            {displayMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                highlight={search.trim() || undefined}
              />
            ))}
            {isTyping && <TypingIndicator />}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input (sticky al fondo) ──────────────────────────────────────────── */}
      {!isSupervising && (
        <div className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white p-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
              <textarea
                ref={inputRef}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje…"
                rows={1}
                disabled={isTyping}
                className="max-h-32 flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
                style={{ lineHeight: '1.4' }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={isTyping}
                aria-label="Enviar mensaje"
                className={[
                  'mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all',
                  isTyping
                    ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95',
                ].join(' ')}
              >
                <SendIcon />
              </button>
            </div>
            <p className="mt-1 text-center text-[10px] text-slate-400">
              Enter para enviar · Shift+Enter para nueva línea
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
