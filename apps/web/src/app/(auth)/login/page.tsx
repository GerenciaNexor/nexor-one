'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { loginRequest, ApiRequestError } from '@/lib/auth-api'

// ─── Validacion del formulario ────────────────────────────────────────────────

function validateForm(email: string, password: string) {
  const errors: { email?: string; password?: string } = {}

  if (!email.trim()) {
    errors.email = 'El correo electronico es requerido'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Ingresa un correo electronico valido'
  }

  if (!password) {
    errors.password = 'La contrasena es requerida'
  } else if (password.length < 6) {
    errors.password = 'La contrasena debe tener al menos 6 caracteres'
  }

  return errors
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="mr-2 h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  function clearFieldError(field: 'email' | 'password') {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError('')

    // Validacion del lado del cliente — no llama al servidor si hay errores
    const errors = validateForm(email, password)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setLoading(true)
    try {
      const data = await loginRequest(email, password)
      setAuth(data.token, data.refreshToken, data.user)
      router.replace('/dashboard')
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 403) {
          setServerError('Tu cuenta esta desactivada. Contacta al administrador de tu empresa.')
        } else if (err.statusCode === 401) {
          // Anti-enumeracion: mismo mensaje para email inexistente o contrasena incorrecta
          setServerError('Correo o contrasena incorrectos.')
        } else {
          setServerError(err.message)
        }
      } else {
        setServerError('El servicio no esta disponible. Intenta nuevamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">

        {/* Marca */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <span className="text-lg font-black text-white">N</span>
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">NEXOR</span>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">Gestion empresarial con IA</p>
        </div>

        {/* Tarjeta del formulario */}
        <div className="rounded-2xl bg-white px-8 py-10 shadow-sm ring-1 ring-slate-200">
          <h1 className="mb-6 text-xl font-semibold text-slate-900">Iniciar sesion</h1>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Campo: correo electronico */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Correo electronico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearFieldError('email')
                }}
                placeholder="admin@tuempresa.com"
                disabled={loading}
                className={[
                  'mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900',
                  'placeholder:text-slate-400 transition-shadow',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0',
                  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
                  fieldErrors.email
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-600',
                ].join(' ')}
              />
              {fieldErrors.email && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Campo: contrasena */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contrasena
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearFieldError('password')
                }}
                placeholder="••••••••"
                disabled={loading}
                className={[
                  'mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900',
                  'placeholder:text-slate-400 transition-shadow',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0',
                  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
                  fieldErrors.password
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-600',
                ].join(' ')}
              />
              {fieldErrors.password && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Error del servidor */}
            {serverError && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {serverError}
              </div>
            )}

            {/* Boton de envio */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Spinner />
                  Verificando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>

        {/* Nota de pie */}
        <p className="mt-6 text-center text-xs text-slate-400">
          ¿Necesitas acceso? Contacta al administrador de tu empresa.
        </p>
      </div>
    </main>
  )
}
