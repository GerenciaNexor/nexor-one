'use client'

/**
 * Chat IA — HU-183: múltiples chats por usuario.
 *
 * Layout master-detail: panel izquierdo con la lista de chats (crear / cambiar / renombrar /
 * eliminar) y panel derecho con el hilo del chat activo + input. Cada chat mantiene su propio
 * historial y contexto (memoria) en el backend. useChatStore es la fuente de verdad del chat activo.
 * Supervisión (TENANT_ADMIN): ver el historial de otro usuario en solo lectura.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { useChatStore, type ChatMessage, type ChatSession, type PaginationMeta } from '@/store/chat'
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'

interface HistoryResponse { data: ChatMessage[]; pagination: PaginationMeta }
interface SessionsResponse { data: ChatSession[] }
interface SessionResponse { data: ChatSession }
interface TenantUser { id: string; name: string; email: string; role: string }

const PAGE_LIMIT = 100

// ─── Iconos ─────────────────────────────────────────────────────────────────
function AgentIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M12 7v2" />
      <rect x="3" y="9" width="18" height="10" rx="3" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" />
    </svg>
  )
}
function SendIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>)
}
function PlusIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>)
}
function TrashIcon() {
  return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>)
}
function PencilIcon() {
  return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>)
}
function ChatIcon() {
  return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>)
}
function ArrowLeftIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>)
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const isToday = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  return isToday ? time : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' · ' + time
}
function relativeDay(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr} h`
  return `hace ${Math.floor(hr / 24)} d`
}

function TypingIndicator() {
  return (
    <div className="mb-3 flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><AgentIcon size={14} /></div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-700">
        {[0, 160, 320].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: `${d}ms` }} />)}
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'} items-end gap-2`}>
      {!isUser && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><AgentIcon size={14} /></div>}
      <div className={`flex max-w-[72%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={['rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed', isUser ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-700 dark:text-slate-100'].join(' ')}>
          {isUser ? msg.content : <MarkdownMessage content={msg.content} />}
        </div>
        <span className="text-[11px] text-slate-400">{formatTimestamp(msg.createdAt)}</span>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'TENANT_ADMIN'

  const {
    sessions, sessionsLoaded, activeSessionId, messages, messagesLoaded, isTyping,
    setSessions, setSessionsLoaded, upsertSession, removeSession, setActiveSession,
    addMessage, setMessages, setTyping, setMessagesLoaded, clearUnread,
  } = useChatStore()

  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  // Supervisión (solo lectura, admin)
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([])
  const [viewingUserId, setViewingUserId] = useState('')
  const isSupervising = isAdmin && viewingUserId !== '' && viewingUserId !== user?.id
  const viewedUser = tenantUsers.find((u) => u.id === viewingUserId)
  const [supMessages, setSupMessages] = useState<ChatMessage[]>([])
  const [supLoading, setSupLoading] = useState(false)

  const isSendingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { clearUnread() }, [clearUnread])

  // ── Cargar la lista de chats al montar ──────────────────────────────────────
  useEffect(() => {
    if (sessionsLoaded) return
    apiClient.get<SessionsResponse>('/v1/chat/sessions')
      .then((r) => {
        setSessions(r.data)
        setSessionsLoaded(true)
        if (r.data.length > 0 && !useChatStore.getState().activeSessionId) setActiveSession(r.data[0]!.id)
      })
      .catch(() => setSessionsLoaded(true))
  }, [sessionsLoaded, setSessions, setSessionsLoaded, setActiveSession])

  // Si la lista ya estaba cargada (p. ej. por el FloatingChat) pero no hay chat activo, elegir el primero.
  useEffect(() => {
    if (sessionsLoaded && !activeSessionId && !isSupervising && sessions.length > 0) setActiveSession(sessions[0]!.id)
  }, [sessionsLoaded, activeSessionId, isSupervising, sessions, setActiveSession])

  // ── Cargar los mensajes del chat activo ─────────────────────────────────────
  useEffect(() => {
    if (!activeSessionId || messagesLoaded || isSupervising) return
    setLoadingMsgs(true)
    apiClient.get<HistoryResponse>(`/v1/chat/sessions/${activeSessionId}/messages?limit=${PAGE_LIMIT}&sort=desc`)
      .then((r) => { setMessages([...r.data].reverse()); setMessagesLoaded(true) })
      .catch(() => setMessagesLoaded(true))
      .finally(() => setLoadingMsgs(false))
  }, [activeSessionId, messagesLoaded, isSupervising, setMessages, setMessagesLoaded])

  // ── Usuarios del tenant (admin, para supervisión) ───────────────────────────
  useEffect(() => {
    if (!isAdmin) return
    apiClient.get<{ data: TenantUser[] }>('/v1/users?limit=100').then((r) => setTenantUsers(r.data)).catch(() => {})
  }, [isAdmin])

  // ── Supervisión: cargar historial del usuario elegido ───────────────────────
  useEffect(() => {
    if (!isSupervising) return
    setSupLoading(true); setSupMessages([])
    apiClient.get<HistoryResponse>(`/v1/chat/history/${viewingUserId}?limit=${PAGE_LIMIT}&sort=desc`)
      .then((r) => setSupMessages([...r.data].reverse()))
      .catch(() => {})
      .finally(() => setSupLoading(false))
  }, [viewingUserId, isSupervising])

  // ── Scroll al fondo ─────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView() }, [activeSessionId, viewingUserId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, supMessages.length, isTyping])

  const refreshSessions = useCallback(async () => {
    try { const r = await apiClient.get<SessionsResponse>('/v1/chat/sessions'); setSessions(r.data) } catch { /* silent */ }
  }, [setSessions])

  // ── Crear un chat nuevo ─────────────────────────────────────────────────────
  async function handleNewChat() {
    setViewingUserId('')
    try {
      const r = await apiClient.post<SessionResponse>('/v1/chat/sessions', {})
      upsertSession(r.data)
      setActiveSession(r.data.id)
      setMessagesLoaded(true) // chat nuevo vacío
      setMobileView('detail')
      setTimeout(() => inputRef.current?.focus(), 80)
    } catch { /* silent */ }
  }

  function handleSelectSession(id: string) {
    setViewingUserId('')
    setActiveSession(id)
    setMobileView('detail')
  }

  async function handleRename(session: ChatSession) {
    const title = window.prompt('Nuevo nombre del chat:', session.title)
    if (title == null) return
    const clean = title.trim()
    if (!clean || clean === session.title) return
    try { const r = await apiClient.patch<SessionResponse>(`/v1/chat/sessions/${session.id}`, { title: clean }); upsertSession(r.data) } catch { /* silent */ }
  }

  async function handleDelete(session: ChatSession) {
    if (!window.confirm(`¿Eliminar el chat "${session.title}"? Esta acción no se puede deshacer.`)) return
    try {
      await apiClient.delete(`/v1/chat/sessions/${session.id}`)
      removeSession(session.id)
      if (activeSessionId === session.id) {
        const next = useChatStore.getState().sessions[0]
        setActiveSession(next ? next.id : null)
      }
    } catch { /* silent */ }
  }

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (isSendingRef.current || isSupervising) return
    const text = inputRef.current?.value.trim()
    if (!text) return
    isSendingRef.current = true
    if (inputRef.current) inputRef.current.value = ''

    // Asegurar un chat activo (crea uno si no hay).
    let sid = useChatStore.getState().activeSessionId
    if (!sid) {
      try {
        const r = await apiClient.post<SessionResponse>('/v1/chat/sessions', {})
        upsertSession(r.data); setActiveSession(r.data.id); setMessagesLoaded(true); sid = r.data.id
      } catch { isSendingRef.current = false; return }
    }

    addMessage({ id: `tmp-${Date.now()}`, role: 'user', content: text, createdAt: new Date().toISOString() })
    setTyping(true)
    try {
      const res = await apiClient.post<{ reply: string; module: string; chatSessionId: string }>('/v1/chat/message', { message: text, chatSessionId: sid })
      addMessage({ id: `tmp-${Date.now()}-a`, role: 'assistant', content: res.reply, module: res.module, createdAt: new Date().toISOString() })
      void refreshSessions() // el título puede haberse autogenerado y el orden cambia
    } catch {
      addMessage({ id: `tmp-${Date.now()}-err`, role: 'assistant', content: 'No pude procesar tu mensaje. Inténtalo de nuevo.', createdAt: new Date().toISOString() })
    } finally {
      setTyping(false); isSendingRef.current = false
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isSupervising, addMessage, setTyping, upsertSession, setActiveSession, setMessagesLoaded, refreshSessions])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const shownMessages = isSupervising ? supMessages : messages
  const shownLoading = isSupervising ? supLoading : loadingMsgs

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Panel izquierdo: lista de chats ─────────────────────────────────── */}
      <div className={['flex w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-72 dark:border-slate-700 dark:bg-slate-800', mobileView === 'detail' ? 'hidden md:flex' : 'flex'].join(' ')}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Chats</span>
          <button onClick={handleNewChat} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700">
            <PlusIcon /> Nuevo
          </button>
        </div>

        {/* Supervisión (admin) */}
        {isAdmin && tenantUsers.length > 0 && (
          <div className="shrink-0 border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <select value={viewingUserId} onChange={(e) => setViewingUserId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
              <option value="">Mis chats</option>
              <optgroup label="Supervisar (solo lectura)">
                {tenantUsers.filter((u) => u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            </select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!sessionsLoaded ? (
            <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">Sin chats. Crea uno con “Nuevo”.</div>
          ) : (
            <ul className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {sessions.map((s) => {
                const active = s.id === activeSessionId && !isSupervising
                return (
                  <li key={s.id} className={['group flex items-center gap-1 px-2', active ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'].join(' ')}>
                    <button onClick={() => handleSelectSession(s.id)} className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-2 text-left">
                      <span className={active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}><ChatIcon /></span>
                      <span className="min-w-0 flex-1">
                        <span className={['block truncate text-sm', active ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'].join(' ')}>{s.title}</span>
                        <span className="block text-[11px] text-slate-400">{relativeDay(s.updatedAt)}</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => handleRename(s)} title="Renombrar" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-600"><PencilIcon /></button>
                      <button onClick={() => handleDelete(s)} title="Eliminar" className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40"><TrashIcon /></button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Panel derecho: hilo del chat activo ─────────────────────────────── */}
      <div className={['flex flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900', mobileView === 'list' ? 'hidden md:flex' : 'flex'].join(' ')}>

        {/* Cabecera */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <button onClick={() => setMobileView('list')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden dark:hover:bg-slate-700"><ArrowLeftIcon /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isSupervising ? `Historial de ${viewedUser?.name ?? ''}` : (activeSession?.title ?? 'Chat IA')}
            </p>
            {isSupervising && <p className="truncate text-xs text-amber-600">Modo supervisión — solo lectura</p>}
          </div>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {shownLoading ? (
            <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>
          ) : !isSupervising && !activeSessionId ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30"><AgentIcon size={22} /></div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Empieza un chat</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">Crea un chat con “Nuevo” o escribe abajo para comenzar uno.</p>
            </div>
          ) : shownMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30"><AgentIcon size={22} /></div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{isSupervising ? 'Este usuario no tiene mensajes' : 'Sin mensajes aún'}</p>
              {!isSupervising && <p className="mt-1 max-w-xs text-xs text-slate-400">Escribe un mensaje para comenzar.</p>}
            </div>
          ) : (
            <>
              {shownMessages.map((m) => <MessageBubble key={m.id} msg={m} />)}
              {isTyping && !isSupervising && <TypingIndicator />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isSupervising && (
          <div className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200 dark:border-slate-600 dark:bg-slate-700">
              <textarea ref={inputRef} onKeyDown={handleKeyDown} placeholder="Escribe un mensaje…" rows={1} disabled={isTyping}
                className="max-h-32 flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100" style={{ lineHeight: '1.4' }} />
              <button onClick={() => void handleSend()} disabled={isTyping} aria-label="Enviar mensaje"
                className={['mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all', isTyping ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'].join(' ')}>
                <SendIcon />
              </button>
            </div>
            <p className="mx-auto mt-1 max-w-3xl text-center text-[10px] text-slate-400">Enter para enviar · Shift+Enter para nueva línea</p>
          </div>
        )}
      </div>
    </div>
  )
}
