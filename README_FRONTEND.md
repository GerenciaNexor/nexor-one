# Frontend (apps/web) — Arquitectura

> Documento de referencia del frontend de NEXOR. Para el backend ver
> [README_ARCHITECTURE.md](./README_ARCHITECTURE.md); para la guía rápida ver [CLAUDE.md](./CLAUDE.md).

`apps/web` es la aplicación web de NEXOR: **Next.js 14 (App Router)** desplegada en Vercel,
escrita en TypeScript, estilizada con **Tailwind CSS** y con estado global en **Zustand**.
Consume la API de `apps/api` (Fastify) vía un único cliente HTTP.

---

## Stack

| Pieza | Tecnología |
|-------|------------|
| Framework | Next.js 14 (App Router) · React 18 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS (`darkMode: 'class'`) |
| Estado global | Zustand (`+ persist` para auth) |
| Markdown (chat) | `react-markdown` + `remark-gfm` |
| Observabilidad | `@sentry/nextjs` |
| Tipos compartidos | `@nexor/shared` (workspace) |

---

## Estructura de rutas

Las rutas viven en [apps/web/src/app/](apps/web/src/app/) y se agrupan así:

```
app/
├── page.tsx                ← Landing pública (/)  — presentación comercial
├── layout.tsx              ← Layout raíz: aplica el tema antes de hidratar (anti-flash)
├── error.tsx / global-error.tsx
├── (auth)/                 ← Rutas públicas
│   ├── layout.tsx
│   └── login/page.tsx      ← Inicio de sesión
└── (dashboard)/            ← Rutas autenticadas (requieren token)
    ├── layout.tsx          ← Monta AppShell + guarda de sesión
    ├── dashboard/page.tsx  ← Panel de inicio (KPIs)
    ├── ari/                ← Ventas: clients, pipeline, quotes, reports
    ├── nira/               ← Compras: suppliers, purchase-orders, compare, ranking, reports
    ├── kira/               ← Inventario: products, stock, movements
    ├── agenda/             ← Agenda (badge REI): calendar, appointments, settings
    ├── vera/               ← Finanzas: transactions, reports, settings
    ├── chat/page.tsx       ← Asistente IA interno
    ├── inbox/page.tsx      ← Bandeja de conversaciones (no visible para OPERATIVE)
    ├── notifications/page.tsx
    ├── settings/           ← integrations, bulk-upload
    └── admin/              ← branches, modules, users, bulk-uploads (TENANT_ADMIN+)
```

> El grupo `(auth)` y `(dashboard)` no afectan la URL (Next.js los usa solo para compartir layout).
> La landing en `/` es pública; las CTAs llevan a `/login`.

---

## Capa de datos del cliente

Toda comunicación con la API pasa por [apps/web/src/lib/](apps/web/src/lib/):

- **[api-client.ts](apps/web/src/lib/api-client.ts)** — cliente HTTP canónico: `apiClient.get/post/put/delete`.
  - Lee el token desde el store Zustand e inyecta el header `Authorization: Bearer <token>`.
  - Ante un **`401`** limpia la sesión (`clearAuth()`) y redirige a `/login` con `window.location.replace`.
  - Soporta `204 No Content` y normaliza errores con `statusCode` y `code`.
  - **Regla**: ninguna llamada al backend usa `fetch` suelto; todo pasa por `apiClient`.
- **[auth-api.ts](apps/web/src/lib/auth-api.ts)** — `loginRequest()` / `logoutRequest()` y el tipo `LoginUser`. Lanza `ApiRequestError(message, statusCode, code)`.
- **[page-cache.ts](apps/web/src/lib/page-cache.ts)** — caché en memoria (vive en el módulo JS, no en storage) para mostrar datos previos mientras se refrescan en segundo plano.
- **[api.ts](apps/web/src/lib/api.ts)** — cliente HTTP alternativo más antiguo. **PENDIENTE: confirmar** si sigue en uso o puede deprecarse en favor de `api-client.ts`.

La URL base sale de `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`).

### Navegación instantánea — patrón _stale-while-revalidate_ (HU-131)

Las pantallas de lista de alto tráfico **inicializan su estado desde `page-cache`** y solo
muestran el skeleton cuando no hay dato cacheado: al volver a una sección se ve **al instante**
la última lista conocida mientras se refresca en segundo plano. Patrón (ver
[kira/products/page.tsx](apps/web/src/app/(dashboard)/kira/products/page.tsx) como referencia):

```ts
const [items, setItems]   = useState<T[]>(() => getCache<T[]>('clave') ?? [])
const [loading, setLoad]  = useState(!getCache<T[]>('clave'))
// en el fetch: solo skeleton si no hay caché; cachear SOLO la vista por defecto (sin filtros)
const noFilters = !search && !filtroA && !filtroB
if (!(noFilters && getCache('clave'))) setLoad(true)
// onSuccess: if (noFilters) setCache('clave', res.data)
```

> **Regla:** se cachea **solo la vista sin filtros** (la lista por defecto). Con búsqueda/filtros
> activos no se lee ni escribe la caché y sí se muestra skeleton — para no enseñar datos de otra vista.

Pantallas con el patrón: `kira/products`, `kira/stock`, `kira/movements`, `nira/suppliers`,
`nira/purchase-orders`, `ari/clients`, `vera/transactions`, `notifications`, `admin/*`. El **AppShell**
también cachea los _feature-flags_ del sidebar y los pide **una sola vez al montar** (no en cada
navegación) refrescándolos al recuperar el foco de la pestaña.

> **Por qué importa (diagnóstico HU-131):** el "congelamiento" de 4-6 s al cambiar de sección que se
> percibía **en `pnpm dev`** son dos costos exclusivos del entorno local: (1) la **compilación
> on-demand de `next dev`** (webpack compila cada ruta en su primera visita: 1-7 s en frío, ~50 ms en
> caliente) y (2) la **BD de producción remota** vía proxy público (`*.proxy.rlwy.net`, ~145 ms por
> round-trip; la tx por-request de HU-122 hace 4 round-trips). **En producción no ocurre:** las rutas
> van **precompiladas** (`next start` sirve cada ruta en ~10 ms, medido) y la API y la BD están
> **co-ubicadas** en Railway (red interna, sub-ms). El `page-cache` mejora la percepción en ambos
> entornos. La compilación de dev es inherente a `next dev`; `--turbo` la recorta ~30 % en rutas
> sucesivas pero no es compatible con el SDK de Sentry en Next 14.2.

---

## Estado global (Zustand)

En [apps/web/src/store/](apps/web/src/store/):

- **[auth.ts](apps/web/src/store/auth.ts)** — token, refreshToken y usuario.
  - **Persiste** en `localStorage` con la key `nexor-auth` (middleware `persist`).
  - Expone `_hasHydrated`: bandera que evita renderizar contenido protegido antes de que
    Zustand termine de leer `localStorage` (previene el *mismatch* de SSR en Next.js).
- **[chat.ts](apps/web/src/store/chat.ts)** — estado del asistente IA (mensajes, `isOpen`, `isTyping`,
  `unreadCount`, paginación). **Efímero** (sin persistencia).

**Preferencias de UI por usuario.** Además del store, hay preferencias que se guardan directo en
`localStorage` por usuario: el **Dashboard** (`/analitica`, HU-129) persiste qué gráficos se muestran
en `nexor-dashboard-charts:<userId>` y los restaura en la siguiente visita (filtro de fechas y
selección respetan el rol; ver [README_MODULES.md](./README_MODULES.md)).

---

## Tema claro / oscuro

- Fuente de verdad: la clase `dark` en `<html>` (Tailwind `darkMode: 'class'`).
- Persistencia en `localStorage` con la key `nexor-theme`.
- **Anti-flash**: un script inline en [layout.tsx](apps/web/src/app/layout.tsx) aplica la clase
  antes de que React hidrate, para no parpadear.
- Hook **[useTheme.ts](apps/web/src/hooks/useTheme.ts)**: lee la clase del DOM (no del estado React,
  para evitar *stale closures*) y la sincroniza con un `MutationObserver`.
- Los overrides de contraste WCAG del modo oscuro están en [globals.css](apps/web/src/app/globals.css).

---

## Marca y branding

Los recursos de marca viven en [apps/web/public/logos/](apps/web/public/logos/):

| Archivo | Uso |
|---------|-----|
| `nexor-light.png` / `nexor-dark.png` | Símbolos originales (alta resolución, transparentes) — masters |
| `icon-light.png` / `icon-dark.png` | Versiones optimizadas (~128px) que usa la app |

- El símbolo se muestra por tema: `icon-light.png` en claro, `icon-dark.png` en oscuro.
- Las versiones optimizadas se regeneran desde los masters con
  [scripts/extract-logo-symbol.py](scripts/extract-logo-symbol.py).

**Tipografía de marca** — la fuente display **Eight One** (Jerry Hodge, libre para uso comercial)
se carga con `@font-face` en [globals.css](apps/web/src/app/globals.css) desde
`public/fonts/eight-one.ttf`, expuesta como la clase utilitaria **`.font-wordmark`**.
Se usa **solo para el wordmark "nexor one"** (logo del sidebar y landing), nunca para la UI:
para texto e interfaz se usa la fuente del sistema, que prioriza legibilidad.

> Si `eight-one.ttf` no está presente, el `@font-face` degrada a la fuente del sistema sin romper nada.

---

## Componentes

En [apps/web/src/components/](apps/web/src/components/), agrupados por área:

| Área | Componentes destacados |
|------|------------------------|
| `layout/` | **AppShell** (sidebar, header, notificaciones, chat flotante), SentryUserContext, ComingSoon |
| `ari/` | AriSubNav, ClientFormModal, DealFormModal, QuoteFormModal, RateClientModal |
| `nira/` | NiraSubNav, SupplierFormModal, PurchaseOrderFormModal, ReceiveModal, RatePurchaseOrderModal |
| `kira/` | KiraSubNav, ProductFormModal, MovementModal |
| `agenda/` | AgendaSubNav, CalendarView, AppointmentsView, AppointmentFormModal, ServiceFormModal |
| `vera/` | VeraSubNav, VeraDashboard, TransactionsView, TransactionFormModal, ReportsView, **LineChart** (genérico: serie única o ingresos/egresos, etiquetas por día/mes — HU-127) |
| `dashboard/` | **BarChart** (ranking horizontal para el Top 10 de productos — HU-130) |
| `chat/` | FloatingChat, MarkdownMessage |
| `landing/` | Reveal (animación al hacer scroll), ChatDemo (conversación animada) |
| `ui/` | Portal, Toast, SkeletonRows |
| `ocr/` | OcrExtractButton |

Hooks en [apps/web/src/hooks/](apps/web/src/hooks/): `useTheme`.

---

## Configuración

- **[next.config.js](apps/web/next.config.js)** — `transpilePackages: ['@nexor/shared']` y
  envoltura `withSentryConfig` (source maps ocultos, plugins de Sentry deshabilitados fuera de producción).
- **[tailwind.config.ts](apps/web/tailwind.config.ts)** — `darkMode: 'class'`, sin extensiones de tema
  (usa los defaults de Tailwind + valores arbitrarios donde se necesita).
- **Variables de entorno** (solo las prefijadas `NEXT_PUBLIC_` llegan al navegador):
  - `NEXT_PUBLIC_API_URL` — URL del backend (default `http://localhost:3001`).
  - `NEXT_PUBLIC_SENTRY_DSN` — DSN de Sentry en runtime (opcional).

---

## Convenciones

1. **Toda** llamada al backend pasa por `apiClient` (nunca `fetch` directo).
2. Los tipos compartidos con el backend se importan de `@nexor/shared` — nunca se duplican.
3. El `tenant_id` jamás se envía desde el frontend: sale del JWT en el backend.
4. La lógica de presentación va en componentes; el fetch + estado, en los modales/vistas que ya existen por módulo.

---

## Comandos

```bash
pnpm --filter @nexor/web dev          # desarrollo (:3000)
pnpm --filter @nexor/web build        # build de producción
pnpm --filter @nexor/web lint         # next lint
pnpm --filter @nexor/web type-check   # tsc --noEmit
```
