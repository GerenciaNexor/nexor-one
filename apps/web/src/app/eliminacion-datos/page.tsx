import type { Metadata } from 'next'
import { LegalLayout } from '@/components/legal/LegalLayout'
import { eliminacionDatos } from '@/content/legal/eliminacion-datos'

export const metadata: Metadata = {
  title:       'Eliminación de datos — NEXOR ONE',
  description: 'Cómo solicitar la eliminación de tus datos personales tratados a través de la plataforma NEXOR.',
}

export default function EliminacionDatosPage() {
  return <LegalLayout doc={eliminacionDatos} />
}
