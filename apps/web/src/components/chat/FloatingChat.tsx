'use client'

/**
 * FloatingChat — HU-057C
 *
 * Botón flotante accesible desde cualquier pantalla del dashboard.
 * Al abrirse muestra los últimos 10 mensajes del historial y permite
 * enviar mensajes al agente en tiempo real.
 *
 * Comportamiento por dispositivo:
 *   - Desktop (lg+): ventana compacta 380×520 px sobre el FAB
 *   - Mobile:        pantalla completa al abrirse
 */

import { useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useChatStore, type ChatMessage } from '@/store/chat'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos de la API ──────────────────────────────────────────────────────────

interface HistoryResponse {
  data: ChatMessage[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

interface SendResponse {
  reply:  string
  module: string
}

// ─── Iconos SVG ───────────────────────────────────────────────────────────────

function AgentIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path d="M12 7v2" />
      <rect x="3" y="9" width="18" height="10" rx="3" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// ─── Indicador de escritura ───────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="h-2 w-2 rounded-full bg-slate-300 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

// ─── Burbuja de mensaje ───────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isUser && (
        <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <AgentIcon size={13} />
        </div>
      )}
      <div
        className={[
          'max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-snug',
          isUser
            ? 'rounded-br-sm bg-blue-600 text-white'
            : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm',
        ].join(' ')}
      >
        {msg.content}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FloatingChat() {
  const {
    isOpen, messages, isTyping, unreadCount,
    historyLoaded,
    open, close,
    addMessage, setMessages, setTyping,
    incrementUnread, clearUnread,
    setHistoryLoaded,
  } = useChatStore()

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const chatWindowRef   = useRef<HTMLDivElement>(null)
  const isSendingRef    = useRef(false)

  // ── Scroll al último mensaje ─────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ── Cargar historial al abrir por primera vez ─────────────────────────────────
  useEffect(() => {
    if (!isOpen || historyLoaded) return

    apiClient
      .get<HistoryResponse>('/v1/chat/history?limit=10')
      .then((res) => {
        setMessages(res.data)
        setHistoryLoaded(true)
      })
      .catch(() => {
        setHistoryLoaded(true)   // falló — no reintentar en bucle
      })
  }, [isOpen, historyLoaded, setMessages, setHistoryLoaded])

  // ── Cerrar al hacer click fuera (solo desktop) ────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    function handleOutsideClick(e: MouseEvent) {
      if (chatWindowRef.current && !chatWindowRef.current.contains(e.target as Node)) {
        close()
      }
    }

    // Pequeño delay para que el click que abre el chat no lo cierre inmediatamente
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen, close])

  // ── Foco en el input al abrir ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [isOpen])

  // ── Enviar mensaje ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (isSendingRef.current) return
    const text = inputRef.current?.value.trim()
    if (!text) return

    isSendingRef.current = true

    // Vaciar el input inmediatamente
    if (inputRef.current) inputRef.current.value = ''

    // Optimismo: agregar mensaje del usuario al historial
    const userMsg: ChatMessage = {
      id:        `tmp-${Date.now()}`,
      role:      'user',
      content:   text,
      createdAt: new Date().toISOString(),
    }
    addMessage(userMsg)
    setTyping(true)

    try {
      const res = await apiClient.post<SendResponse>('/v1/chat/message', { message: text })

      const assistantMsg: ChatMessage = {
        id:        `tmp-${Date.now()}-a`,
        role:      'assistant',
        content:   res.reply,
        module:    res.module,
        createdAt: new Date().toISOString(),
      }
      addMessage(assistantMsg)

      // Badge solo si la ventana está cerrada
      if (!useChatStore.getState().isOpen) {
        incrementUnread()
      }
    } catch {
      const errorMsg: ChatMessage = {
        id:        `tmp-${Date.now()}-err`,
        role:      'assistant',
        content:   'No pude procesar tu mensaje. Inténtalo de nuevo.',
        createdAt: new Date().toISOString(),
      }
      addMessage(errorMsg)
    } finally {
      setTyping(false)
      isSendingRef.current = false
      inputRef.current?.focus()
    }
  }, [addMessage, setTyping, incrementUnread])

  // ── Tecla Enter para enviar (Shift+Enter = nueva línea) ───────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // ── Abrir y limpiar badge ─────────────────────────────────────────────────────
  function handleOpen() {
    clearUnread()
    open()
  }

  return (
    <Portal>
      {/* ── FAB (oculto en mobile cuando el chat está abierto) ─────────────────── */}
      <button
        onClick={handleOpen}
        aria-label="Abrir chat con el agente"
        className={[
          'fixed bottom-6 right-6 z-50',
          'flex h-14 w-14 items-center justify-center',
          'rounded-full bg-blue-600 text-white shadow-lg',
          'transition-all duration-200 hover:bg-blue-700 hover:scale-105 active:scale-95',
          isOpen ? 'hidden lg:flex' : 'flex',
        ].join(' ')}
      >
        <AgentIcon size={24} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Ventana de chat ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={chatWindowRef}
          className={[
            // Base: posición fija, z-index alto, fondo blanco, borde y sombra
            'fixed z-50 flex flex-col overflow-hidden',
            'bg-white shadow-2xl',
            // Mobile: pantalla completa
            'inset-0 rounded-none',
            // Desktop: ventana compacta flotante
            'lg:inset-auto lg:bottom-24 lg:right-6',
            'lg:w-[380px] lg:h-[520px]',
            'lg:rounded-2xl lg:border lg:border-slate-200',
            // Animación de entrada
            'chat-enter',
          ].join(' ')}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-blue-600 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <AgentIcon size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Agente NEXOR</p>
                <p className="text-[11px] text-blue-200">Chat interno</p>
              </div>
            </div>
            <button
              onClick={close}
              aria-label="Cerrar chat"
              className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Lista de mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {messages.length === 0 && !isTyping ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  <AgentIcon size={22} />
                </div>
                <p className="text-sm font-medium text-slate-700">¿En qué puedo ayudarte?</p>
                <p className="mt-1 max-w-[200px] text-xs text-slate-400">
                  Pregunta sobre stock, compras, ventas o cualquier información de tu módulo.
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}

                {isTyping && (
                  <div className="mb-2 flex items-start">
                    <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <AgentIcon size={13} />
                    </div>
                    <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white shadow-sm">
                      <TypingIndicator />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Enlace al historial completo */}
          <div className="shrink-0 border-t border-slate-100 px-4 py-1.5">
            <Link
              href="/chat"
              onClick={close}
              className="flex items-center justify-center gap-1 text-xs font-medium text-blue-600 hover:underline"
            >
              Ver historial completo
              <ExternalLinkIcon />
            </Link>
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-slate-100 bg-white p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200 transition-all">
              <textarea
                ref={inputRef}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje…"
                rows={1}
                className={[
                  'flex-1 resize-none bg-transparent text-sm text-slate-800',
                  'placeholder:text-slate-400 outline-none',
                  'max-h-24 overflow-y-auto',
                ].join(' ')}
                style={{ lineHeight: '1.4' }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={isTyping}
                aria-label="Enviar mensaje"
                className={[
                  'mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                  'transition-all duration-150',
                  isTyping
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
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
    </Portal>
  )
}
