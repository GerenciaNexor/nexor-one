import type { Metadata } from 'next'
import { LegalLayout } from '@/components/legal/LegalLayout'
import { privacidad } from '@/content/legal/privacidad'

export const metadata: Metadata = {
  title:       'Política de Privacidad — NEXOR ONE',
  description: 'Cómo NEXOR ONE SAS recopila, usa y protege los datos personales tratados a través de la plataforma NEXOR.',
}

export default function PrivacidadPage() {
  return <LegalLayout doc={privacidad} />
}
