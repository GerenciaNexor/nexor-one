# README_ROLES — Sistema de Roles y Permisos NEXOR V1

> El control de acceso en NEXOR tiene dos dimensiones: el **rol** (nivel jerárquico) y el **módulo** (área de trabajo). Un usuario de nivel OPERATIVE en KIRA no puede ver datos de ARI. Esta separación es deliberada y crítica para la seguridad de los datos de los clientes.

---

## Los 5 niveles de rol

```
SUPER_ADMIN          ← Equipo NEXOR (ve todos los tenants)
    └── TENANT_ADMIN     ← Dueño / Gerente general de la empresa
          └── BRANCH_ADMIN  ← Encargado de una sucursal
                └── AREA_MANAGER  ← Jefe de área (ARI, NIRA, KIRA, AGENDA, VERA)
                      └── OPERATIVE     ← Vendedor, Bodeguero, Comprador, Recepcionista
```

---

## Descripción detallada de cada rol

### SUPER_ADMIN — identidad de PLATAFORMA (HU-134)
**Quién lo tiene:** Solo el equipo interno de NEXOR (máximo 2-3 personas).

> **Identidad separada por diseño (HU-134):** el SUPER_ADMIN **NO es un usuario de tenant**. Vive en
> la tabla **`platform_admins`** (sin `tenant_id`), con **login propio** (`/v1/platform/auth/login`)
> que emite un **JWT sin `tenantId`** (`{ platformAdminId, role: 'SUPER_ADMIN' }`). Así nunca está
> atado a una empresa ni ve sus datos de negocio. El valor `SUPER_ADMIN` del enum `Role` se conserva
> (lo lleva el JWT de plataforma y el de impersonación), pero **ningún registro de `users` tiene ese rol**.

**Qué puede hacer:**
- **Crear clientes** (tenants) con su primer admin, módulos y **suscripción** (monto), y **editar el
  monto** o **activar/cancelar** la suscripción — gestión manual, sin cobro automático (HU-138).
- **Crear y gestionar demos** (HU-142/145): **solo el SUPER_ADMIN** crea demos (no autoservicio).
  Tenant real con expiración (default 15 días, tope 30), duración editable
  (`PUT /v1/admin/tenants/:id/demo`). Al vencer se **suspende solo** (acceso bloqueado) **sin borrar
  datos**. En el detalle del cliente ve por demo: **días restantes, uso de IA (X/30, modelo),
  límites de datos (X/N por entidad) y estado**; puede **extender** la duración y **conectar
  WhatsApp/Gmail** (HU-139) si el cliente lo pide.
  - **Anti-duplicado (HU-141/145):** al crear una demo el **NIT es obligatorio** y el sistema
    **bloquea** (`409 DEMO_DUPLICATE`) si esa empresa **ya tuvo una demo** (aunque expirada o
    convertida) o **ya fue cliente** — detectado por el identificador estable de HU-141: **NIT**
    (`tax_id` normalizado) o, secundariamente, el **correo del admin**.
- Ver todos los tenants de la plataforma · activar/desactivar tenants · modificar feature flags
- Impersonar cualquier tenant para soporte (`/v1/admin/tenants/:id/impersonate` → JWT de tenant de 1h; queda en audit log con IP y `platformAdminId`)
- Acceder a todos los endpoints bajo `/v1/admin/*` (guard `superAdminHook`: exige `platformAdminId`)

**Auditoría (HU-136):** toda acción administrativa de plataforma (activar/cancelar cliente, módulos,
impersonación, y —cuando existan— alta de cliente con monto y conexión de canales) queda en el registro
**inmutable** `platform_audit_logs` (`logPlatformAction()`), visible en `GET /v1/admin/audit-logs`.
Ningún cliente accede a ese historial.

**Qué NO puede hacer:**
- Acceder a rutas de tenant con su token de plataforma → **403 `PLATFORM_IDENTITY_FORBIDDEN`**. El
  único camino a datos de una empresa es la **impersonación** (explícita y auditada).

**Cómo se crea:** Insertando en `platform_admins` (script/seed con `directPrisma`). Los SUPER_ADMIN
que existieran en `users` se migran con `pnpm --filter @nexor/api db:migrate-superadmins`.

---

### TENANT_ADMIN
**Quién lo tiene:** El dueño o gerente general de la empresa cliente. Máximo 2-3 por tenant.  
**Qué puede hacer:**
- Ver datos de **toda la empresa** (todas las sucursales, todos los módulos activos)
- Crear, editar y desactivar sucursales
- Crear, editar y desactivar cualquier usuario del tenant
- Cambiar roles de cualquier usuario (excepto SUPER_ADMIN)
- Configurar feature flags del tenant (qué módulos están activos)
- Acceder a todos los reportes de todos los módulos
- Ver el dashboard financiero completo de VERA

**Cómo se crea:** El equipo NEXOR lo crea durante el onboarding del cliente.

---

### BRANCH_ADMIN
**Quién lo tiene:** El encargado o gerente de una sucursal específica.  
**Qué puede hacer:**
- Ver datos de **su sucursal únicamente** (no ve otras sucursales)
- Crear y gestionar usuarios de su sucursal
- Acceder a todos los módulos activos — pero solo datos de su sucursal
- Ver reportes de su sucursal (no consolidados de la empresa)

**Lo que NO puede:**
- Ver datos de otras sucursales
- Ver el dashboard financiero consolidado de VERA (solo sus propias transacciones)
- Crear sucursales nuevas
- Cambiar feature flags del tenant

---

### AREA_MANAGER
**Quién lo tiene:** El jefe de área de un módulo específico. Tiene acceso total a su módulo y lectura en módulos relacionados.  
**Requiere campo adicional:** `module` — indica cuál es su módulo principal.

| AREA_MANAGER de | Acceso total en | Lectura en |
|-----------------|-----------------|------------|
| ARI | Ventas, clientes, deals, cotizaciones, reportes ARI | Stock de KIRA, transacciones de VERA |
| NIRA | Proveedores, OCs, aprobar OCs, reportes NIRA | Alertas de KIRA, transacciones de VERA |
| KIRA | Productos, stock, movimientos, reportes KIRA | OCs de NIRA |
| AGENDA | Citas, disponibilidad, tipos de servicio | Nada adicional |
| VERA | Transacciones, presupuestos, reportes financieros | Datos de ARI y NIRA |

**Acciones exclusivas del AREA_MANAGER:**
- NIRA: aprobar órdenes de compra
- KIRA: aprobar ajustes de inventario
- ARI: ver reportes de rendimiento del equipo de ventas
- AGENDA: configurar horarios de disponibilidad

---

### OPERATIVE
**Quién lo tiene:** Los usuarios operativos del día a día. Tienen acceso limitado a **acciones básicas de su módulo**.  
**Requiere campo adicional:** `module` — indica en qué área trabaja.

| OPERATIVE de | Puede hacer | No puede hacer |
|--------------|-------------|----------------|
| ARI (Vendedor) | Crear/editar clientes, mover deals, ver cotizaciones propias, registrar interacciones | Ver reportes, ver deals de otros vendedores, crear cotizaciones (V1) |
| NIRA (Comprador) | Crear borradores de OC, registrar recepción de mercancía | Aprobar OCs, ver reportes financieros |
| KIRA (Bodeguero) | Registrar entradas y salidas de stock, ver stock | Aprobar ajustes, modificar mínimos/máximos |
| AGENDA (Recepcionista) | Crear y gestionar citas, ver calendario | Configurar disponibilidad, tipos de servicio |
| VERA (Contador) | Ver transacciones y reportes | Crear o modificar transacciones |

---

## Implementación técnica

### En el JWT
El token JWT incluye:
```json
{
  "userId": "clxuser1",
  "tenantId": "clxtenant1",
  "branchId": "clxbranch1",
  "role": "AREA_MANAGER",
  "module": "KIRA",
  "iat": 1234567890,
  "exp": 1235567890
}
```

### En el middleware de Fastify
```typescript
// El middleware extrae estos valores del JWT y los pone en el request
request.tenantId  // Siempre presente — filtra todos los datos
request.userId    // Para saber quién hace la acción
request.role      // Para verificar permisos
request.module    // Para AREA_MANAGER y OPERATIVE
request.branchId  // Para BRANCH_ADMIN (filtra por sucursal)
```

### Guard de rol (ejemplo)
```typescript
// En el handler del endpoint
if (!['TENANT_ADMIN', 'AREA_MANAGER'].includes(request.role)) {
  return reply.status(403).send({ error: 'Forbidden' })
}
// Para AREA_MANAGER, verificar además que el módulo coincide
if (request.role === 'AREA_MANAGER' && request.module !== 'NIRA') {
  return reply.status(403).send({ error: 'Forbidden' })
}
```

### Helpers reales de autorización (`apps/api/src/lib/guards.ts`)

En la práctica los endpoints no escriben los `if` a mano: usan los helpers de
`guards.ts`. Estos son los reales del proyecto:

**Jerarquía de roles (de menor a mayor privilegio):**

```
OPERATIVE < AREA_MANAGER < BRANCH_ADMIN < TENANT_ADMIN < SUPER_ADMIN
```

Un rol superior hereda todos los permisos de los inferiores.

| Helper | Qué hace |
|--------|----------|
| `hasMinRole(userRole, minRole)` | Función pura: compara la jerarquía y devuelve `true` si `userRole >= minRole`. Útil en condicionales dentro de los servicios. |
| `requireRole(minRole)` | PreHandler que exige un rol mínimo. Devuelve `403` (nunca `404`) si el rol es insuficiente. |
| `requireModule(requiredModule)` | PreHandler que exige el feature flag/módulo activo. Para `AREA_MANAGER` y `OPERATIVE` verifica que su `module` coincida; los roles superiores pasan sin restricción de módulo. |
| `requireRoleAndModule(minRole, requiredModule)` | Combina ambos: devuelve un par `[PreHandler, PreHandler]` listo para usar en `preHandler`. Es el patrón más común. |

**Atajos para roles frecuentes:**

| Atajo | Equivale a |
|-------|-----------|
| `requireSuperAdmin()` | `requireRole('SUPER_ADMIN')` — endpoints `/v1/admin` |
| `requireTenantAdmin()` | `requireRole('TENANT_ADMIN')` — configuración del tenant |
| `requireBranchAdmin()` | `requireRole('BRANCH_ADMIN')` — encargado de sucursal o superior |
| `requireAreaManager()` | `requireRole('AREA_MANAGER')` — jefe de área o superior (cualquier módulo) |

**Pricing / feature flags y multi-sucursal:**

| Helper | Qué hace |
|--------|----------|
| `requireFeatureFlag(module)` | PreHandler que bloquea con `403 MODULE_DISABLED` si el tenant no tiene ese módulo habilitado en su plan. Se aplica en el `index.ts` de cada módulo y cubre todos sus endpoints. |
| `getBranchFilter(user)` | Devuelve el `branchId` a usar como filtro `WHERE`: el suyo para `BRANCH_ADMIN`/`AREA_MANAGER`/`OPERATIVE`, `undefined` para `TENANT_ADMIN`/`SUPER_ADMIN` (ven todas las sucursales). |
| `canAccessBranch(user, targetBranchId)` | Devuelve `true` si el usuario puede ver datos de esa sucursal. Útil antes de devolver un recurso específico (p. ej. `GET /branches/:id`). |

**Uso típico en una ruta:**

```typescript
// "al menos AREA_MANAGER, y si es AREA_MANAGER/OPERATIVE debe ser de NIRA"
fastify.post('/purchase-orders/:id/approve', {
  preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
}, handler)
```

---

## Reglas de negocio críticas sobre roles

1. **Un OPERATIVE nunca puede ver datos de otro módulo.** Si un Bodeguero hace GET /v1/ari/clients, debe recibir 403.

2. **Un BRANCH_ADMIN nunca puede ver datos de otra sucursal.** El `branchId` del JWT se usa para filtrar todas las queries.

3. **El `tenantId` siempre viene del JWT, nunca del body.** Si un usuario manipula el request para poner otro `tenantId`, el JWT lo rechaza.

4. **Solo TENANT_ADMIN y SUPER_ADMIN pueden cambiar roles.** Un usuario no puede escalar sus propios privilegios.

5. **La impersonación del SUPER_ADMIN siempre queda registrada.** Sin excepciones.

---

## Matriz de permisos por módulo

| Acción | SUPER_ADMIN | TENANT_ADMIN | BRANCH_ADMIN | AREA_MANAGER | OPERATIVE |
|--------|:-----------:|:------------:|:------------:|:------------:|:---------:|
| Ver todos los tenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear sucursales | ✅ | ✅ | ❌ | ❌ | ❌ |
| Crear usuarios | ✅ | ✅ | ✅ (su sucursal) | ❌ | ❌ |
| Cambiar feature flags | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver reportes del módulo | ✅ | ✅ | ✅ (su sucursal) | ✅ (su módulo) | ❌ |
| Aprobar OC (NIRA) | ✅ | ✅ | ✅ | ✅ NIRA | ❌ |
| Aprobar ajuste stock (KIRA) | ✅ | ✅ | ✅ | ✅ KIRA | ❌ |
| Crear movimiento stock | ✅ | ✅ | ✅ | ✅ | ✅ KIRA |
| Mover deal de etapa (ARI) | ✅ | ✅ | ✅ | ✅ | ✅ ARI |
| Ver dashboard financiero | ✅ | ✅ | ✅ (parcial) | ✅ VERA | ❌ |
| Impersonar tenant | ✅ | ❌ | ❌ | ❌ | ❌ |
