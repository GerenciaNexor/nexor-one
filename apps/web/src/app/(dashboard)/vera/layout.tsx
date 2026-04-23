import type { ReactNode } from 'react'
import { VeraSubNav } from '@/components/vera/VeraSubNav'

export default function VeraLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VeraSubNav />
      {children}
    </>
  )
}
