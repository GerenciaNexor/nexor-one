import Link from 'next/link'
import type { Metadata } from 'next'
import { Reveal } from '@/components/landing/Reveal'
import { ChatDemo } from '@/components/landing/ChatDemo'
import { ContactForm } from '@/components/landing/ContactForm'

export const metadata: Metadata = {
  title: 'NEXOR — Consultora de tecnología: software, IA y sistemas a la medida',
  description:
    'En NEXOR construimos el software, la inteligencia artificial, los agentes, las integraciones y las plataformas que tu empresa necesita — a la medida. Y si buscas una solución lista, tenemos NEXOR ONE, nuestra plataforma de gestión con IA.',
}

// ─── Datos ────────────────────────────────────────────────────────────────────

// Lo que construye NEXOR (consultora). Todo respaldado por lo que ya construimos en NEXOR ONE.
const SERVICES = [
  {
    title: 'Software y plataformas a la medida',
    desc: 'Sistemas de gestión, paneles, ERPs, portales y aplicaciones web hechos para tu operación, no al revés.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M3 5v14h18V5M3 9h18M7 5v4" />,
  },
  {
    title: 'Inteligencia artificial',
    desc: 'IA adaptada a tu negocio: que entiende tus datos, decide y actúa. Tecnología propia, integrada en tu operación.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3l1.2 3 3 1.2-3 1.2L9.5 12 8.3 8.6 5.3 7.4l3-1.2L9.5 3zM17 12l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2z" />,
  },
  {
    title: 'Agentes y bots inteligentes',
    desc: 'Asistentes que atienden y ejecutan tareas por WhatsApp, correo o dentro de tus sistemas — de forma autónoma.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" />,
  },
  {
    title: 'Integraciones',
    desc: 'Conectamos lo que ya usas: APIs, WhatsApp Business, Gmail, pasarelas de pago y cualquier servicio externo.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5l4 4m-9 9l-2 2a3 3 0 01-4-4l2-2m3-3l-2 2a3 3 0 004 4l2-2m2-9l2-2a3 3 0 014 4l-2 2" />,
  },
  {
    title: 'Automatización de procesos',
    desc: 'Flujos, notificaciones y recordatorios que trabajan solos, para que tu equipo deje de hacerlo a mano.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006 5.3M4 15a8 8 0 0014 3.7" />,
  },
  {
    title: 'Lo que tu empresa necesite',
    desc: '¿Tienes una idea o un problema tecnológico? Cuéntanos: evaluamos, diseñamos y lo construimos contigo.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m9-9H3m15.5-5.5l-13 13m13 0l-13-13" />,
  },
] as const

const PILLARS = [
  { value: 'A la medida', label: 'Construimos lo que tu empresa necesita' },
  { value: 'IA propia', label: 'Agentes e inteligencia artificial' },
  { value: 'Integraciones', label: 'WhatsApp, Gmail, APIs y más' },
  { value: 'NEXOR ONE', label: 'Y una plataforma lista para usar' },
]

const PROCESS = [
  { n: '01', title: 'Escuchamos tu necesidad', desc: 'Entendemos tu negocio y el problema real que quieres resolver — sin tecnicismos.' },
  { n: '02', title: 'Diseñamos la solución', desc: 'Proponemos la tecnología correcta para tu caso, tu presupuesto y tus tiempos.' },
  { n: '03', title: 'Construimos y acompañamos', desc: 'Desarrollamos, probamos y ponemos en marcha. Y seguimos contigo después de entregar.' },
]

// Producto NEXOR ONE — módulos (portafolio + oferta lista).
const MODULES = [
  { badge: 'ARI',  title: 'Ventas',     desc: 'CRM y pipeline comercial: clientes, cotizaciones y seguimiento hasta el cierre.', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M21 7v5m0-5h-5" /> },
  { badge: 'NIRA', title: 'Compras',    desc: 'Proveedores, órdenes de compra y aprobaciones, con control de entregas y costos.', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12m-7 3a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /> },
  { badge: 'KIRA', title: 'Inventario', desc: 'Stock en tiempo real, movimientos inmutables, alertas de mínimos y clasificación ABC.', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /> },
  { badge: 'REI',  title: 'Agenda',     desc: 'Citas y reservas con recordatorios automáticos, sin huecos ni cruces en tu calendario.', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
  { badge: 'VERA', title: 'Finanzas',   desc: 'Flujo de caja, presupuestos y alertas financieras para decidir con números al día.', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { badge: 'PRO',  title: 'Proyectos',  desc: 'Metas y presupuestos por línea de negocio, con avance, alertas y control de sobregasto.', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a5 5 0 100 10 5 5 0 000-10zm0 3a2 2 0 100 4 2 2 0 000-4z" /> },
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
    <svg className="h-5 w-5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true">
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

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.15-1.7-.84-1.96-.94-.26-.1-.45-.15-.64.15-.19.29-.74.94-.9 1.13-.17.19-.33.22-.62.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.29-.02-.45.13-.6.13-.13.29-.33.44-.5.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.08-.15-.64-1.55-.88-2.12-.23-.56-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.38s1.02 2.76 1.17 2.95c.15.19 2.02 3.08 4.9 4.32.68.29 1.22.47 1.63.6.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34zM12 2a10 10 0 00-8.6 15.06L2 22l5.05-1.32A10 10 0 1012 2z" />
    </svg>
  )
}

// ─── Mockup del producto NEXOR ONE (ejemplo de lo que construimos) ────────────

function ProductMockup() {
  const bars = [45, 62, 38, 70, 52, 84, 60]
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1326] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
        <span className="h-3 w-3 rounded-full bg-green-400/70" />
        <span className="ml-3 rounded-md bg-white/5 px-3 py-1 text-xs text-slate-400">app.nexor.one/dashboard</span>
      </div>
      <div className="flex">
        <div className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-white/10 py-4 sm:flex">
          <img src="/logos/icon-dark.png" alt="" aria-hidden="true" className="h-7 w-auto object-contain" />
          <div className="mt-2 h-2 w-6 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-2 w-6 rounded-full bg-white/10" />)}
        </div>
        <div className="flex-1 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Buenas tardes</p>
              <p className="text-sm font-semibold text-white">Resumen de hoy</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600" />
          </div>
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
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-[10px] text-slate-500">Ingresos · últimos 7 días</p>
            <div className="flex h-24 items-end gap-2">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-purple-600/40 to-cyan-400/80" style={{ height: `${h}%` }} />
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
        <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 animate-glow rounded-full bg-emerald-600/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[30rem] w-[30rem] animate-glow rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute bottom-0 -left-40 h-[28rem] w-[28rem] animate-glow rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      <div className="relative">
        {/* ── Navbar ─────────────────────────────────────────────────────────── */}
        <header className="mx-auto flex max-w-6xl animate-fade-up items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <img src="/logos/icon-dark.png" alt="NEXOR" className="h-9 w-auto object-contain" />
            <span className="font-wordmark text-2xl font-semibold tracking-tight text-slate-100">nexor</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <a href="#servicios" className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white md:inline-block">Servicios</a>
            <a href="#nexor-one" className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white md:inline-block">NEXOR ONE</a>
            <a href="#contacto" className="hidden rounded-lg px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:text-emerald-200 sm:inline-block">Contacto</a>
            <Link href="/login" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur transition-colors hover:bg-white/10">
              Iniciar sesión
            </Link>
          </div>
        </header>

        {/* ── Hero — la consultora ───────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 text-center sm:pt-20">
          <div className="mx-auto mb-8 flex justify-center">
            <img src="/logos/icon-dark.png" alt="" aria-hidden="true" className="h-24 w-auto animate-float object-contain drop-shadow-[0_0_40px_rgba(16,185,129,0.4)] sm:h-32" />
          </div>

          <span className="inline-block animate-fade-up rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-300" style={{ animationDelay: '80ms' }}>
            Consultora de tecnología · Software · IA · Automatización
          </span>

          <h1 className="mx-auto mt-6 max-w-4xl animate-fade-up text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl" style={{ animationDelay: '160ms' }}>
            Construimos la{' '}
            <span className="animate-gradient bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">tecnología</span>
            {' '}que tu empresa necesita
          </h1>

          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-slate-300" style={{ animationDelay: '240ms' }}>
            En NEXOR desarrollamos software, plataformas, inteligencia artificial, agentes, integraciones y
            automatizaciones — <strong className="text-slate-100">a la medida de tu negocio</strong>. Si lo necesitas,
            lo construimos. Y si buscas una solución lista, tenemos <strong className="text-slate-100">NEXOR ONE</strong>.
          </p>

          <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-4 sm:flex-row" style={{ animationDelay: '320ms' }}>
            <a href="#contacto" className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.02] sm:w-auto">
              Cuéntanos tu proyecto
            </a>
            <a href="#nexor-one" className="w-full rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-center text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:bg-white/10 sm:w-auto">
              Conoce NEXOR ONE
            </a>
          </div>
        </section>

        {/* ── Pilares ────────────────────────────────────────────────────────── */}
        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
            {PILLARS.map((s, i) => (
              <Reveal key={s.label} delay={i * 80} className="text-center">
                <p className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-xl font-bold text-transparent sm:text-2xl">{s.value}</p>
                <p className="mt-1 text-sm text-slate-400">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Qué es NEXOR ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Quiénes somos</h2>
            <p className="mt-5 text-2xl font-medium leading-relaxed text-slate-200 sm:text-3xl">
              Somos una consultora de tecnología. Diseñamos y construimos{' '}
              <span className="text-white">cualquier sistema, software o inteligencia artificial</span> que tu empresa
              necesite — desde una idea hasta ponerlo a funcionar.
            </p>
          </Reveal>
        </section>

        {/* ── Servicios (qué construimos) ────────────────────────────────────── */}
        <section id="servicios" className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Qué construimos</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Si tiene que ver con software, datos o inteligencia artificial, lo hacemos. Estos son nuestros servicios.
            </p>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s, i) => (
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
          </div>
        </section>

        {/* ── Cómo trabajamos ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Reveal className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Cómo trabajamos</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">De la idea a la solución funcionando, contigo en cada paso.</p>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {PROCESS.map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur">
                  <span className="font-wordmark bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-4xl font-bold text-transparent">{s.n}</span>
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── NEXOR ONE — portafolio + producto listo ────────────────────────── */}
        <section id="nexor-one" className="relative border-y border-cyan-400/10 bg-cyan-500/[0.03]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 right-1/4 h-[26rem] w-[26rem] rounded-full bg-purple-600/10 blur-[120px]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-6 py-20">
            <Reveal className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-300">
                Nuestra plataforma · <span className="font-wordmark">NEXOR ONE</span>
              </span>
              <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-5xl">
                ¿No necesitas algo a la medida?{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Usa NEXOR ONE</span>
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
                Nuestra plataforma lista de gestión empresarial con IA. La construimos nosotros — es la mejor prueba
                de lo que podemos hacer por ti — y puedes empezar a usarla hoy.
              </p>
            </Reveal>

            {/* Mockup */}
            <Reveal delay={120} className="mt-14">
              <ProductMockup />
            </Reveal>

            {/* Módulos */}
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => (
                <Reveal key={m.badge} delay={i * 70}>
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
            </div>

            {/* Agentes de NEXOR ONE */}
            <Reveal className="mt-8">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur sm:p-12">
                <div className="grid items-center gap-10 lg:grid-cols-2">
                  <div>
                    <h3 className="text-2xl font-bold text-white sm:text-3xl">
                      Con agentes de IA que{' '}
                      <span className="bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">conversan y resuelven</span>
                    </h3>
                    <p className="mt-5 leading-relaxed text-slate-300">
                      Tus clientes escriben por WhatsApp o Gmail. El agente entiende, consulta tu información en tiempo
                      real y responde con datos correctos — o ejecuta la acción que haga falta, con registro de cada paso.
                    </p>
                    <ul className="mt-7 space-y-4">
                      {[
                        'Atiende dudas de productos, precios y disponibilidad al instante.',
                        'Crea cotizaciones, agenda citas y registra movimientos sin intervención manual.',
                        'Cada acción queda auditada para total trazabilidad y control.',
                      ].map((t) => (
                        <li key={t} className="flex items-start gap-3"><CheckIcon /><span className="text-slate-300">{t}</span></li>
                      ))}
                    </ul>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                      <Link href="/login" className="rounded-xl bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-transform hover:scale-[1.02]">
                        Entrar a la plataforma
                      </Link>
                      <a href="mailto:gerencia@nexor-one.com?subject=Demo%20de%20NEXOR%20ONE" className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-center text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:bg-white/10">
                        Solicitar una demo
                      </a>
                    </div>
                  </div>
                  <ChatDemo />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Contacto (consultora) ──────────────────────────────────────────── */}
        <section id="contacto" className="mx-auto max-w-6xl px-6 py-20">
          <Reveal className="mb-12 text-center">
            <span className="inline-block rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-300">
              Hablemos
            </span>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              Cuéntanos tu proyecto y{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">te lo construimos</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Escríbenos qué necesitas o qué problema quieres resolver. Te contactamos para entender tu caso y
              proponerte una solución — sin compromiso.
            </p>
          </Reveal>

          <Reveal>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-600/10 via-[#0b1020] to-cyan-600/10 p-8 backdrop-blur sm:p-12">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
                <div>
                  <h3 className="text-xl font-semibold text-white">Contacto directo</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    ¿Prefieres escribirnos directo? Estamos a un mensaje de distancia.
                  </p>
                  <div className="mt-6 space-y-3">
                    <a href="https://wa.me/573134969078?text=Hola%2C%20me%20interesa%20un%20desarrollo%20a%20la%20medida%20con%20NEXOR" target="_blank" rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.01]">
                      <WhatsAppIcon /> Escríbenos por WhatsApp
                    </a>
                    <a href="mailto:gerencia@nexor-one.com?subject=Proyecto%20a%20la%20medida%20—%20NEXOR" className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:bg-white/10">
                      <MailIcon /> gerencia@nexor-one.com
                    </a>
                  </div>
                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm font-semibold text-white">Construimos NEXOR ONE.</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                      Todo lo que ves en nuestra plataforma —los agentes, el multi-tenant, las integraciones, la
                      automatización— lo construimos nosotros. <span className="text-emerald-300">Podemos construir lo tuyo.</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0d1326]/60 p-6 sm:p-7">
                  <ContactForm />
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── CTA final — dos caminos ────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-600/20 via-[#0b1020] to-purple-600/20 p-10 text-center sm:p-16">
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Dos caminos, una decisión</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-300">
                Pídenos la tecnología a la medida que tu empresa necesita — o empieza a usar NEXOR ONE, nuestra
                plataforma lista, hoy mismo.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a href="#contacto" className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.02] sm:w-auto">
                  Quiero algo a la medida
                </a>
                <Link href="/login" className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-8 py-3.5 text-sm font-semibold text-cyan-200 backdrop-blur transition-colors hover:bg-cyan-500/20 sm:w-auto">
                  Usar NEXOR ONE
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
            <div className="flex items-center gap-2">
              <img src="/logos/icon-dark.png" alt="NEXOR" className="h-7 w-auto object-contain" />
              <span className="font-wordmark text-lg font-semibold text-slate-300">nexor</span>
            </div>
            <p className="text-sm text-slate-500">Consultora de tecnología · Software · IA · NEXOR ONE</p>
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
