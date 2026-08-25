import Link from 'next/link'
import type { Metadata } from 'next'
import { Reveal } from '@/components/landing/Reveal'
import { ChatDemo } from '@/components/landing/ChatDemo'
import { ContactForm } from '@/components/landing/ContactForm'

export const metadata: Metadata = {
  title: 'NEXOR ONE — Plataforma de gestión con IA + desarrollo a la medida (NEXOR IT)',
  description:
    'Usa NEXOR para gestionar ventas, compras, inventario, agenda, finanzas y proyectos con IA propia; o pide a NEXOR IT una plataforma web, agentes, integraciones y automatizaciones a la medida de tu empresa.',
}

// ─── Datos ────────────────────────────────────────────────────────────────────

const MODULES = [
  {
    badge: 'ARI',
    title: 'Ventas',
    desc: 'CRM y pipeline comercial: clientes, cotizaciones y seguimiento de oportunidades hasta el cierre.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M21 7v5m0-5h-5" />,
  },
  {
    badge: 'NIRA',
    title: 'Compras',
    desc: 'Gestión de proveedores, órdenes de compra y aprobaciones, con control de entregas y costos.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12m-7 3a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />,
  },
  {
    badge: 'KIRA',
    title: 'Inventario',
    desc: 'Stock en tiempo real, movimientos inmutables, alertas de mínimos y clasificación ABC automática.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
  },
  {
    badge: 'REI',
    title: 'Agenda',
    desc: 'Citas y reservas con recordatorios automáticos, evitando huecos y cruces en tu calendario.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  },
  {
    badge: 'VERA',
    title: 'Finanzas',
    desc: 'Flujo de caja, presupuestos y alertas financieras para decidir con números claros y al día.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  },
  {
    badge: 'PRO',
    title: 'Proyectos',
    desc: 'Metas (objetivo) y presupuestos (límite) por línea de negocio, con avance, alertas y control de sobregasto.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a5 5 0 100 10 5 5 0 000-10zm0 3a2 2 0 100 4 2 2 0 000-4z" />,
  },
] as const

const STATS = [
  { value: '6', label: 'Módulos de negocio' },
  { value: '2', label: 'Canales: WhatsApp + Gmail' },
  { value: '24/7', label: 'Atención automática' },
  { value: '100%', label: 'Acciones auditadas' },
]

const STEPS = [
  {
    n: '01',
    title: 'Conecta tus canales',
    desc: 'Integra WhatsApp y Gmail en minutos. Tus clientes siguen escribiendo por donde ya lo hacen.',
  },
  {
    n: '02',
    title: 'Activa tus módulos',
    desc: 'Enciende ventas, compras, inventario, agenda y finanzas según lo que tu empresa necesite.',
  },
  {
    n: '03',
    title: 'Deja que la IA opere',
    desc: 'Los agentes atienden, cotizan, agendan y registran. Tú lo ves todo en un panel claro y en tiempo real.',
  },
]

const BENEFITS = [
  {
    title: 'Tus datos, totalmente aislados',
    desc: 'Cada empresa opera sobre su propio espacio seguro. Nadie ve la información de nadie — aislamiento garantizado a nivel de base de datos.',
  },
  {
    title: 'Agentes que sí actúan',
    desc: 'No es solo un chatbot: los agentes consultan stock, crean cotizaciones, agendan citas y registran movimientos reales, con auditoría de cada acción.',
  },
  {
    title: 'Atención 24/7 por WhatsApp y Gmail',
    desc: 'Tus clientes escriben por los canales que ya usan y reciben respuesta al instante, a cualquier hora, sin que tu equipo tenga que estar conectado.',
  },
  {
    title: 'Todo en un solo lugar',
    desc: 'Ventas, compras, inventario, agenda y finanzas conectados entre sí. Se acabó saltar entre planillas y sistemas que no se hablan.',
  },
]

// NEXOR IT — servicios de desarrollo a la medida (respaldados por lo construido en NEXOR).
const IT_SERVICES = [
  {
    title: 'Plataformas web a la medida',
    desc: 'Sistemas de gestión, paneles y ERPs hechos para tu operación: como NEXOR, pero moldeado a tu negocio.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M3 5v14h18V5M3 9h18M7 5v4" />,
  },
  {
    title: 'Agentes y bots inteligentes',
    desc: 'Asistentes que atienden y ejecutan tareas por WhatsApp y correo — como los que operan dentro de NEXOR.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" />,
  },
  {
    title: 'IA personalizada',
    desc: 'Automatización con inteligencia artificial adaptada a tu negocio: entiende tus datos y actúa sobre ellos.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3l1.2 3 3 1.2-3 1.2L9.5 12 8.3 8.6 5.3 7.4l3-1.2L9.5 3zM17 12l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2z" />,
  },
  {
    title: 'Integraciones',
    desc: 'Conectamos tus sistemas: APIs, WhatsApp Business, Gmail y las herramientas que ya usas.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5l4 4m-9 9l-2 2a3 3 0 01-4-4l2-2m3-3l-2 2a3 3 0 004 4l2-2m2-9l2-2a3 3 0 014 4l-2 2" />,
  },
  {
    title: 'Automatización de procesos',
    desc: 'Flujos, notificaciones y recordatorios que trabajan solos, para que tu equipo deje de hacerlo a mano.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006 5.3M4 15a8 8 0 0014 3.7" />,
  },
] as const

// ─── Iconos auxiliares ────────────────────────────────────────────────────────

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75h19.5v10.5H2.25z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 1.125 0 00-1.173.417l-.97 1.293a.75.75 0 01-.982.218 12.05 12.05 0 01-5.03-5.03.75.75 0 01.218-.982l1.293-.97a1.125 1.125 0 00.417-1.173L8.212 4.02a1.125 1.125 0 00-1.091-.852H5.25A2.25 2.25 0 003 5.25v1.5z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.15-1.7-.84-1.96-.94-.26-.1-.45-.15-.64.15-.19.29-.74.94-.9 1.13-.17.19-.33.22-.62.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.29-.02-.45.13-.6.13-.13.29-.33.44-.5.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.08-.15-.64-1.55-.88-2.12-.23-.56-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.38s1.02 2.76 1.17 2.95c.15.19 2.02 3.08 4.9 4.32.68.29 1.22.47 1.63.6.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34zM12 2a10 10 0 00-8.6 15.06L2 22l5.05-1.32A10 10 0 1012 2z" />
    </svg>
  )
}

// ─── Mockup del producto (ilustración del dashboard) ──────────────────────────

function ProductMockup() {
  const bars = [45, 62, 38, 70, 52, 84, 60]
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1326] shadow-2xl">
      {/* Barra de ventana */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
        <span className="h-3 w-3 rounded-full bg-green-400/70" />
        <span className="ml-3 rounded-md bg-white/5 px-3 py-1 text-xs text-slate-400">app.nexor.one/dashboard</span>
      </div>

      <div className="flex">
        {/* Mini-sidebar */}
        <div className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-white/10 py-4 sm:flex">
          <img src="/logos/icon-dark.png" alt="" aria-hidden="true" className="h-7 w-auto object-contain" />
          <div className="mt-2 h-2 w-6 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-2 w-6 rounded-full bg-white/10" />
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Buenas tardes</p>
              <p className="text-sm font-semibold text-white">Resumen de hoy</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600" />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Ventas del mes', v: '$ 12.4M', up: '+18%' },
              { l: 'Stock crítico', v: '3', up: 'KIRA' },
              { l: 'Citas hoy', v: '7', up: 'REI' },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] text-slate-500">{k.l}</p>
                <p className="mt-1 text-lg font-bold text-white">{k.v}</p>
                <span className="text-[10px] font-medium text-cyan-400">{k.up}</span>
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-[10px] text-slate-500">Ingresos · últimos 7 días</p>
            <div className="flex h-24 items-end gap-2">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-purple-600/40 to-cyan-400/80"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-200 antialiased">

      {/* Resplandor de fondo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 animate-glow rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[30rem] w-[30rem] animate-glow rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative">
        {/* ── Navbar ─────────────────────────────────────────────────────────── */}
        <header className="mx-auto flex max-w-6xl animate-fade-up items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <img src="/logos/icon-dark.png" alt="NEXOR ONE" className="h-9 w-auto object-contain" />
            <span className="font-wordmark text-2xl font-semibold tracking-tight text-slate-100 [word-spacing:-0.2em]">
              nexor one
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="#nexor-it"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:text-emerald-200 sm:inline-block"
            >
              NEXOR IT
            </a>
            <a
              href="#demo"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white sm:inline-block"
            >
              Solicita una demo
            </a>
            <Link
              href="/login"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur transition-colors hover:bg-white/10"
            >
              Iniciar sesión
            </Link>
          </div>
        </header>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 text-center sm:pt-20">
          <div className="mx-auto mb-8 flex justify-center">
            <img
              src="/logos/icon-dark.png"
              alt=""
              aria-hidden="true"
              className="h-28 w-auto animate-float object-contain drop-shadow-[0_0_40px_rgba(124,58,237,0.45)] sm:h-36"
            />
          </div>

          <span className="inline-block animate-fade-up rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-cyan-300" style={{ animationDelay: '80ms' }}>
            SaaS de gestión empresarial con IA agéntica
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl animate-fade-up text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl" style={{ animationDelay: '160ms' }}>
            El sistema operativo de tu empresa,{' '}
            <span className="animate-gradient bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              potenciado por agentes de IA
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-slate-300" style={{ animationDelay: '240ms' }}>
            NEXOR centraliza ventas, compras, inventario, agenda y finanzas en una sola plataforma.
            Y va más allá: agentes de IA que atienden a tus clientes por WhatsApp y Gmail, ejecutan
            tareas reales y trabajan por ti las 24 horas.
          </p>

          <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-4 sm:flex-row" style={{ animationDelay: '320ms' }}>
            <Link
              href="/login"
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 px-7 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-transform hover:scale-[1.02] sm:w-auto"
            >
              Entrar a la plataforma
            </Link>
            <a
              href="#modulos"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-center text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:bg-white/10 sm:w-auto"
            >
              Conoce los módulos
            </a>
          </div>

          {/* Vistazo del producto */}
          <Reveal delay={120} className="mt-16">
            <ProductMockup />
          </Reveal>
        </section>

        {/* ── Banda de datos ─────────────────────────────────────────────────── */}
        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 80} className="text-center">
                <p className="bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-slate-400">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Qué es NEXOR ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-purple-400">¿Qué es NEXOR?</h2>
            <p className="mt-5 text-2xl font-medium leading-relaxed text-slate-200 sm:text-3xl">
              Una plataforma multi-tenant que reúne las áreas clave de tu negocio y les suma{' '}
              <span className="text-white">agentes de inteligencia artificial</span> que entienden,
              deciden y actúan sobre tus datos reales — siempre con registro de cada paso.
            </p>
          </Reveal>
        </section>

        {/* ── Cómo funciona ──────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Cómo funciona</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">En tres pasos tu empresa pasa a operar con IA.</p>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur">
                  <span className="font-wordmark bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-4xl font-bold text-transparent">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Módulos ────────────────────────────────────────────────────────── */}
        <section id="modulos" className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Todo tu negocio, un solo sistema</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Cada área de tu empresa, cubierta. Conectadas entre sí para que la información fluya sin fricción.
            </p>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <Reveal key={m.badge} delay={i * 80}>
                <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 text-cyan-300 transition-transform duration-300 group-hover:scale-110">
                      <Icon>{m.icon}</Icon>
                    </span>
                    <span className="font-wordmark text-xs font-bold tracking-widest text-slate-500">{m.badge}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{m.desc}</p>
                </div>
              </Reveal>
            ))}

            {/* Tarjeta destacada: agentes */}
            <Reveal delay={MODULES.length * 80}>
              <div className="h-full rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6 backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 text-white">
                    <Icon>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3l1.5 3 3 1.5-3 1.5L9.5 12 8 9l-3-1.5 3-1.5L9.5 3zM18 12l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
                    </Icon>
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white">Agentes de IA</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  El corazón de NEXOR. Atienden a tus clientes y operan los módulos por ti, de forma autónoma y auditada.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Agentes IA en detalle ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Reveal>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur sm:p-12">
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <h2 className="text-3xl font-bold text-white sm:text-4xl">
                    Agentes que conversan{' '}
                    <span className="bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">y resuelven</span>
                  </h2>
                  <p className="mt-5 leading-relaxed text-slate-300">
                    Tus clientes escriben por WhatsApp o Gmail. El agente entiende el mensaje, consulta tu
                    información en tiempo real y responde con datos correctos — o ejecuta la acción que haga falta.
                  </p>
                  <ul className="mt-7 space-y-4">
                    {[
                      'Responde dudas de productos, precios y disponibilidad al instante.',
                      'Crea cotizaciones, agenda citas y registra movimientos sin intervención manual.',
                      'Cada acción queda registrada para total trazabilidad y control.',
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-3">
                        <CheckIcon />
                        <span className="text-slate-300">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <ChatDemo />
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Beneficios ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Por qué las empresas eligen NEXOR</h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i * 90}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur transition-colors hover:bg-white/[0.05]">
                  <div className="flex items-start gap-4">
                    <CheckIcon />
                    <div>
                      <h3 className="font-semibold text-white">{b.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.desc}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Solicita tu demo (HU-147) ──────────────────────────────────────── */}
        <section id="demo" className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-12 text-center">
            <span className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-cyan-300">
              Prueba NEXOR
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              ¿Te interesa nuestro producto?{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Solicita tu demo
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Pruébalo con tus propios datos durante <strong className="text-slate-300">15 días</strong>. Es una
              prueba <strong className="text-slate-300">limitada en tiempo y en cantidad de datos</strong>, pensada
              para que conozcas el producto sin montar toda tu operación.
            </p>
          </Reveal>

          <Reveal>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-600/15 via-[#0b1020] to-cyan-600/15 p-8 backdrop-blur sm:p-12">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                {/* Qué incluye */}
                <div>
                  <h3 className="text-lg font-semibold text-white">Qué incluye la demo</h3>
                  <ul className="mt-5 space-y-3">
                    {[
                      'Acceso a los cinco módulos — ARI (ventas), NIRA (compras), KIRA (inventario), AGENDA (citas) y VERA (finanzas) — más el Dashboard.',
                      'Carga tus propios datos de muestra (con los límites del plan demo).',
                      'Prueba el agente de IA que responde y ejecuta tareas por ti.',
                      'Opción de conectar un WhatsApp o Gmail (lo activamos nosotros si lo pides).',
                      '15 días de duración; al terminar, tus datos se conservan por si decides continuar.',
                    ].map((item) => (
                      <li key={item} className="flex gap-3">
                        <CheckIcon />
                        <span className="text-sm leading-relaxed text-slate-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Contacto (la demo NO es autoservicio) */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
                  <h3 className="text-lg font-semibold text-white">Solicítala por contacto</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    La demo la activamos nosotros — no es autoservicio. Escríbenos o llámanos y te la preparamos.
                  </p>
                  <div className="mt-6 space-y-3">
                    <a
                      href="mailto:gerencia@nexor-one.com"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-transform hover:scale-[1.02]"
                    >
                      <MailIcon /> gerencia@nexor-one.com
                    </a>
                    <a
                      href="tel:+573134969078"
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:bg-white/10"
                    >
                      <PhoneIcon /> +57 313 496 9078
                    </a>
                  </div>
                  <p className="mt-4 text-center text-xs text-slate-500">Te respondemos y coordinamos el acceso a tu demo.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── NEXOR IT — desarrollo a la medida (HU-203) ─────────────────────── */}
        <section id="nexor-it" className="relative border-y border-emerald-400/10 bg-emerald-500/[0.03]">
          {/* Resplandor propio de la línea de servicios */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 left-1/3 h-[26rem] w-[26rem] rounded-full bg-emerald-500/10 blur-[120px]" />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 py-20">
            <Reveal className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-emerald-300">
                <span className="font-wordmark">NEXOR IT</span> · Desarrollo a la medida
              </span>
              <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-5xl">
                ¿La plataforma estándar no te encaja del todo?{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Te la construimos.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
                NEXOR IT es nuestro brazo de desarrollo: plataformas web, agentes, IA, integraciones y automatizaciones
                hechas para tu empresa. Si necesitas algo propio, lo diseñamos y lo construimos contigo.
              </p>
            </Reveal>

            {/* Servicios */}
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {IT_SERVICES.map((s, i) => (
                <Reveal key={s.title} delay={i * 80}>
                  <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/25 hover:bg-emerald-500/[0.05]">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 transition-transform duration-300 group-hover:scale-110">
                      <Icon>{s.icon}</Icon>
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
                  </div>
                </Reveal>
              ))}

              {/* NEXOR como portafolio / prueba de capacidad */}
              <Reveal delay={IT_SERVICES.length * 80}>
                <div className="flex h-full flex-col justify-center rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-6 backdrop-blur">
                  <h3 className="text-lg font-semibold text-white">Construimos NEXOR.</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    Todo lo que ves en esta plataforma —los agentes, el multi-tenant, las integraciones, la
                    automatización— lo construimos nosotros. Es nuestra mejor carta de presentación.
                  </p>
                  <p className="mt-3 text-sm font-semibold text-emerald-300">Podemos construir lo tuyo.</p>
                </div>
              </Reveal>
            </div>

            {/* Llamado a la acción: formulario + contacto directo */}
            <Reveal className="mt-14">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur sm:p-12">
                <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Cuéntanos tu proyecto</h3>
                    <p className="mt-3 leading-relaxed text-slate-300">
                      Escríbenos qué necesitas o qué problema quieres resolver. Te contactamos para entender tu caso y
                      proponerte una solución a la medida — sin compromiso.
                    </p>
                    <div className="mt-7 space-y-3">
                      <a
                        href="https://wa.me/573134969078?text=Hola%2C%20me%20interesa%20una%20plataforma%20a%20la%20medida%20con%20NEXOR%20IT"
                        target="_blank" rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.01]"
                      >
                        <WhatsAppIcon /> Escríbenos por WhatsApp
                      </a>
                      <a
                        href="mailto:gerencia@nexor-one.com?subject=Proyecto%20a%20la%20medida%20—%20NEXOR%20IT"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:bg-white/10"
                      >
                        <MailIcon /> gerencia@nexor-one.com
                      </a>
                    </div>
                  </div>

                  {/* Formulario de contacto */}
                  <div className="rounded-2xl border border-white/10 bg-[#0d1326]/60 p-6 sm:p-7">
                    <ContactForm />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── CTA final ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-600/20 via-[#0b1020] to-emerald-600/20 p-10 text-center sm:p-16">
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Dos caminos, una decisión</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-300">
                Usa NEXOR para gestionar tu negocio hoy — o pídenos una plataforma a la medida si necesitas algo propio.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/login"
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-transform hover:scale-[1.02] sm:w-auto"
                >
                  Usar NEXOR
                </Link>
                <a
                  href="#nexor-it"
                  className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-8 py-3.5 text-sm font-semibold text-emerald-200 backdrop-blur transition-colors hover:bg-emerald-500/20 sm:w-auto"
                >
                  Quiero algo a la medida
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
            <div className="flex items-center gap-2">
              <img src="/logos/icon-dark.png" alt="NEXOR ONE" className="h-7 w-auto object-contain" />
              <span className="font-wordmark text-lg font-semibold text-slate-300 [word-spacing:-0.2em]">nexor one</span>
            </div>
            <p className="text-sm text-slate-500">Gestión empresarial con IA · ARI · NIRA · KIRA · REI · VERA · PRO</p>
          </div>
          <div className="mx-auto max-w-6xl border-t border-white/5 px-6 py-5">
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-400 sm:justify-start">
              <Link href="/privacidad" className="transition-colors hover:text-white">Política de Privacidad</Link>
              <Link href="/terminos" className="transition-colors hover:text-white">Términos del Servicio</Link>
              <Link href="/eliminacion-datos" className="transition-colors hover:text-white">Eliminación de datos</Link>
              <a href="mailto:gerencia@nexor-one.com" className="transition-colors hover:text-white">gerencia@nexor-one.com</a>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  )
}
