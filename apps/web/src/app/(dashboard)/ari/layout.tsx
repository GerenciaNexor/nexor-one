import type { ReactNode } from 'react'
import { AriSubNav } from '@/components/ari/AriSubNav'

export default function AriLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AriSubNav />
      {children}
    </>
  )
}
