'use client'

import { create } from 'zustand'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  module?:   string | null
  createdAt: string
}

export interface ChatSession {
  id:        string
  title:     string
  createdAt: string
  updatedAt: string
}

export interface PaginationMeta {
  page:  number
  limit: number
  total: number
  pages: number
}

interface ChatStore {
  // Ventana flotante
  isOpen:        boolean
  unreadCount:   number

  // Sesiones (HU-183) — varios chats por usuario
  sessions:        ChatSession[]
  sessionsLoaded:  boolean
  activeSessionId: string | null

  // Mensajes del chat ACTIVO
  messages:        ChatMessage[]
  messagesLoaded:  boolean
  isTyping:        boolean
  pagination:      PaginationMeta | null

  open:            () => void
  close:           () => void
  toggle:          () => void
  incrementUnread: () => void
  clearUnread:     () => void

  setSessions:     (s: ChatSession[]) => void
  setSessionsLoaded: (v: boolean) => void
  upsertSession:   (s: ChatSession) => void
  removeSession:   (id: string) => void
  setActiveSession: (id: string | null) => void

  addMessage:       (msg: ChatMessage) => void
  setMessages:      (msgs: ChatMessage[]) => void
  prependMessages:  (msgs: ChatMessage[]) => void
  setTyping:        (v: boolean) => void
  setMessagesLoaded:(v: boolean) => void
  setPagination:    (p: PaginationMeta | null) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()((set) => ({
  isOpen:          false,
  unreadCount:     0,

  sessions:        [],
  sessionsLoaded:  false,
  activeSessionId: null,

  messages:        [],
  messagesLoaded:  false,
  isTyping:        false,
  pagination:      null,

  open:  () => set({ isOpen: true, unreadCount: 0 }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, unreadCount: !s.isOpen ? 0 : s.unreadCount })),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clearUnread:     () => set({ unreadCount: 0 }),

  setSessions:       (sessions) => set({ sessions }),
  setSessionsLoaded: (v)        => set({ sessionsLoaded: v }),
  // Inserta o actualiza una sesión y la deja arriba (más reciente).
  upsertSession:     (session)  => set((s) => ({
    sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)],
  })),
  removeSession:     (id)       => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
  // Cambiar de chat activo limpia los mensajes en memoria; el componente recarga el historial.
  setActiveSession:  (id)       => set((s) => (
    id === s.activeSessionId
      ? {}
      : { activeSessionId: id, messages: [], messagesLoaded: false, pagination: null, isTyping: false }
  )),

  addMessage:       (msg)  => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages:      (msgs) => set({ messages: msgs }),
  prependMessages:  (msgs) => set((s) => ({ messages: [...msgs, ...s.messages] })),
  setTyping:        (v)    => set({ isTyping: v }),
  setMessagesLoaded:(v)    => set({ messagesLoaded: v }),
  setPagination:    (p)    => set({ pagination: p }),
}))
