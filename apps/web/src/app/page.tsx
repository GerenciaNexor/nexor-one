import { redirect } from 'next/navigation'

/** Redirige la raiz al dashboard (usuarios autenticados) o al login. */
export default function RootPage() {
  redirect('/login')
}
