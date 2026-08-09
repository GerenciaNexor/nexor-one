import type { Metadata } from 'next'
import { LegalLayout } from '@/components/legal/LegalLayout'
import { terminos } from '@/content/legal/terminos'

export const metadata: Metadata = {
  title:       'Términos del Servicio — NEXOR ONE',
  description: 'Términos y condiciones de uso de la plataforma NEXOR, operada por NEXOR ONE S.A.S.',
}

export default function TerminosPage() {
  return <LegalLayout doc={terminos} />
}
