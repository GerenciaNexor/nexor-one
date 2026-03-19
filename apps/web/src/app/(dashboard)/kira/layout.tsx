import type { ReactNode } from 'react'
import { KiraSubNav } from '@/components/kira/KiraSubNav'

export default function KiraLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <KiraSubNav />
      {children}
    </>
  )
}
