import type { ReactNode } from 'react'
import { AgendaSubNav } from '@/components/agenda/AgendaSubNav'

export default function AgendaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AgendaSubNav />
      {children}
    </>
  )
}
