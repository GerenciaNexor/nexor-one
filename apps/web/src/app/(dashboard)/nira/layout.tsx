import type { ReactNode } from 'react'
import { NiraSubNav } from '@/components/nira/NiraSubNav'

export default function NiraLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NiraSubNav />
      {children}
    </>
  )
}
