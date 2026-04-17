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

interface ChatStore {
  isOpen:        boolean
  messages:      ChatMessage[]
  isTyping:      boolean
  unreadCount:   number
  historyLoaded: boolean

  open:             () => void
  close:            () => void
  toggle:           () => void
  addMessage:       (msg: ChatMessage) => void
  setMessages:      (msgs: ChatMessage[]) => void
  setTyping:        (v: boolean) => void
  incrementUnread:  () => void
  clearUnread:      () => void
  setHistoryLoaded: (v: boolean) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()((set) => ({
  isOpen:        false,
  messages:      [],
  isTyping:      false,
  unreadCount:   0,
  historyLoaded: false,

  open:  () => set({ isOpen: true,  unreadCount: 0 }),
  close: () => set({ isOpen: false }),
  toggle: () =>
    set((s) => ({
      isOpen:      !s.isOpen,
      unreadCount: !s.isOpen ? 0 : s.unreadCount,
    })),

  addMessage:       (msg)  => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages:      (msgs) => set({ messages: msgs }),
  setTyping:        (v)    => set({ isTyping: v }),
  incrementUnread:  ()     => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clearUnread:      ()     => set({ unreadCount: 0 }),
  setHistoryLoaded: (v)    => set({ historyLoaded: v }),
}))
