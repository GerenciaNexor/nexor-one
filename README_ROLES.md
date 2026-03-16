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

### SUPER_ADMIN
**Quién lo tiene:** Solo el equipo interno de NEXOR (máximo 2-3 personas).  
**Qué puede hacer:**
- Ver todos los tenants de la plataforma
- Activar y desactivar tenants
- Impersonar cualquier cuenta para soporte técnico (queda en audit log con timestamp, IP y userId)
- Modificar feature flags de cualquier tenant
- Acceder a todos los endpoints bajo `/v1/admin/*`

**Qué NO puede hacer:**
- Modificar datos de negocio (clientes, productos, OCs) de un tenant sin impersonar — y al impersonar, la acción queda registrada

**Cómo se crea:** Solo mediante script directo en la DB. No existe endpoint para crear SUPER_ADMIN.

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
