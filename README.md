# NEXOR — Sistema de Gestión Empresarial con IA

> Sistema de gestión empresarial multi-tenant con inteligencia artificial agéntica. Plataforma SaaS para empresas con múltiples sucursales que centraliza ventas, compras, inventario y agendamiento, potenciado por agentes de IA que operan en WhatsApp y email.

---

## Documentación del proyecto

Este repositorio tiene documentación exhaustiva para que cualquier desarrollador pueda entender, contribuir y mantener el sistema sin perder el contexto de las decisiones tomadas.

### Empieza aquí según lo que necesites

| Si necesitas saber... | Lee este documento |
|-----------------------|--------------------|
| Cómo instalar y correr el proyecto localmente | [README_DEVELOPMENT.md](./README_DEVELOPMENT.md) *(pendiente — Sprint 1)* |
| Cómo está organizado el sistema y por qué | [README_ARCHITECTURE.md](./README_ARCHITECTURE.md) |
| Qué tablas hay en la DB y cómo se relacionan | [README_DATABASE.md](./README_DATABASE.md) |
| Qué endpoints existen y cómo usarlos | [README_ENDPOINTS.md](./README_ENDPOINTS.md) |
| Qué hace cada módulo (ARI, NIRA, KIRA, etc.) | [README_MODULES.md](./README_MODULES.md) |
| Qué puede hacer cada rol de usuario | [README_ROLES.md](./README_ROLES.md) |
| Cómo funcionan los agentes de IA | [README_AGENTS.md](./README_AGENTS.md) |
| Cómo funciona WhatsApp y Gmail | [README_INTEGRATIONS.md](./README_INTEGRATIONS.md) |
| Cómo activar un nuevo cliente | [README_ONBOARDING_CLIENT.md](./README_ONBOARDING_CLIENT.md) |

---

## Resumen del sistema

**Stack:** Next.js 14 + Fastify + PostgreSQL + Redis + Claude API (Anthropic)  
**Monorepo:** Turborepo + pnpm  
**Multi-tenancy:** Base de datos compartida con Row-Level Security  
**IA:** Agentes agénticos con tool use — operan en WhatsApp y Gmail  

**Módulos V1:**
- **ARI** — Ventas, CRM y pipeline comercial
- **NIRA** — Compras y gestión de proveedores
- **KIRA** — Inventario y control de stock
- **AGENDA** — Agendamiento de citas
- **VERA** — Finanzas y reportes

---

## Reglas que nunca se rompen

1. El `tenant_id` siempre viene del JWT — nunca del body del request
2. Los `agent_logs` y `stock_movements` son inmutables — nunca se editan ni eliminan
3. Los tokens de integración (WhatsApp, Gmail) siempre cifrados — nunca en responses de la API
4. El webhook siempre responde 200 inmediatamente — la lógica va en el worker
5. Ninguna migración a producción sin backup verificado minutos antes
6. Los cambios que rompen la API van en `/v2/` — `/v1/` no se toca

---

## Estructura del repositorio

```
nexor/
├── apps/
│   ├── api/          ← Backend Fastify (Railway)
│   └── web/          ← Frontend Next.js (Vercel)
├── packages/
│   ├── shared/       ← Tipos TypeScript compartidos
│   └── ui/           ← Componentes compartidos (V2)
├── .github/
│   └── workflows/    ← CI/CD con GitHub Actions
├── README.md                        ← Este archivo
├── README_ARCHITECTURE.md
├── README_DATABASE.md
├── README_ENDPOINTS.md
├── README_MODULES.md
├── README_ROLES.md
├── README_AGENTS.md
├── README_INTEGRATIONS.md
├── README_ONBOARDING_CLIENT.md
└── README_DEVELOPMENT.md            ← Pendiente Sprint 1
```
