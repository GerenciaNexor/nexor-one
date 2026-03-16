# README_ENDPOINTS — API de NEXOR V1

> **Base URL local:** `http://localhost:3001`  
> **Base URL producción:** `https://api.nexor.app` (o la URL de Railway)  
> **Versionado:** Todos los endpoints de negocio están bajo `/v1/`  
> **Autenticación:** JWT Bearer Token en el header `Authorization: Bearer <token>`  
> **Multi-tenancy:** El `tenant_id` se extrae automáticamente del JWT — nunca se pasa como parámetro

---

## Convenciones

- Todos los requests y responses son `Content-Type: application/json`
- Los errores siempre tienen la forma `{ "error": "mensaje descriptivo", "code": "ERROR_CODE" }`
- Los IDs son siempre strings (CUID)
- Las fechas son siempre ISO 8601 con zona horaria
- La paginación usa `?page=1&limit=20` y devuelve `{ data: [], total, page, limit, totalPages }`
- Los endpoints marcados con 🤖 pueden ser llamados también por el AgentRunner de la IA

---

## Autenticación — `/v1/auth`

No requieren token salvo donde se indique.

---

### `POST /v1/auth/login`
**Propósito:** Iniciar sesión. Devuelve el JWT con el tenantId, userId y role embebidos.

**Request:**
```json
{
  "email": "admin@empresa.com",
  "password": "mi-contraseña"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clx123",
    "email": "admin@empresa.com",
    "name": "María García",
    "role": "TENANT_ADMIN",
    "tenantId": "clxabc",
    "tenant": { "id": "clxabc", "name": "Farmacia López", "slug": "farmacia-lopez" },
    "branchId": null
  }
}
```

**Errores:** `401` credenciales incorrectas · `403` cuenta desactivada

---

### `POST /v1/auth/refresh`
**Propósito:** Renovar el token JWT antes de que expire.

**Request:** `{ "refreshToken": "..." }`  
**Response 200:** `{ "token": "nuevo-jwt" }`

---

### `POST /v1/auth/logout`
**Requiere token:** Sí  
**Propósito:** Cerrar sesión (invalida el refresh token).  
**Response 200:** `{ "message": "Logged out successfully" }`

---

### `GET /v1/auth/me`
**Requiere token:** Sí  
**Propósito:** Obtener el perfil del usuario autenticado con sus permisos.

**Response 200:**
```json
{
  "id": "clx123",
  "name": "María García",
  "email": "admin@empresa.com",
  "role": "TENANT_ADMIN",
  "module": null,
  "tenant": { "id": "clxabc", "name": "Farmacia López" },
  "branch": null,
  "featureFlags": { "ARI": true, "NIRA": true, "KIRA": true, "AGENDA": false, "VERA": true }
}
```

---

## Super Admin — `/v1/admin`
**Rol requerido:** `SUPER_ADMIN` únicamente. Toda acción queda en audit log.

---

### `GET /v1/admin/tenants`
**Propósito:** Listar todos los tenants de la plataforma.  
**Response 200:** `{ "data": [{ "id", "name", "slug", "isActive", "createdAt" }], "total" }`

### `GET /v1/admin/tenants/:id`
**Propósito:** Ver detalle completo de un tenant (usuarios, módulos activos, integraciones).

### `PUT /v1/admin/tenants/:id/toggle`
**Propósito:** Activar o desactivar un tenant.  
**Request:** `{ "isActive": false }`

### `POST /v1/admin/tenants/:id/impersonate`
**Propósito:** Obtener un token que actúa como TENANT_ADMIN de ese tenant (para soporte).  
**Response 200:** `{ "token": "jwt-de-impersonacion", "expiresIn": "1h" }`  
**Nota:** Queda registrado en audit log con el userId del Super Admin.

---

## Tenants y configuración — `/v1/tenants`

---

### `GET /v1/tenants/me`
**Propósito:** Ver configuración del tenant del usuario autenticado.

### `PUT /v1/tenants/me`
**Rol requerido:** `TENANT_ADMIN`  
**Propósito:** Actualizar nombre, logo, zona horaria, moneda.

### `GET /v1/tenants/feature-flags`
**Propósito:** Ver qué módulos están activos para el tenant.  
**Response 200:** `{ "ARI": true, "NIRA": true, "KIRA": true, "AGENDA": false, "VERA": true }`

### `PUT /v1/tenants/feature-flags`
**Rol requerido:** `TENANT_ADMIN` o `SUPER_ADMIN`  
**Request:** `{ "module": "AGENDA", "enabled": true }`

---

## Sucursales — `/v1/branches`

---

### `GET /v1/branches`
**Propósito:** Listar sucursales del tenant. BRANCH_ADMIN ve solo la suya.  
**Response 200:** `{ "data": [{ "id", "name", "city", "address", "isActive" }] }`

### `POST /v1/branches`
**Rol requerido:** `TENANT_ADMIN`  
**Request:** `{ "name": "Sede Norte", "city": "Medellín", "address": "Cra 10 #20-30" }`

### `PUT /v1/branches/:id`
**Rol requerido:** `TENANT_ADMIN` o `BRANCH_ADMIN` de esa sucursal

### `DELETE /v1/branches/:id`
**Rol requerido:** `TENANT_ADMIN`  
**Nota:** Soft delete — solo desactiva, no elimina datos.

---

## Usuarios — `/v1/users`

---

### `GET /v1/users`
**Propósito:** Listar usuarios del tenant. BRANCH_ADMIN ve solo los de su sucursal.

### `POST /v1/users`
**Rol requerido:** `TENANT_ADMIN` o `BRANCH_ADMIN`  
**Request:**
```json
{
  "email": "vendedor@empresa.com",
  "name": "Carlos Pérez",
  "role": "OPERATIVE",
  "module": "ARI",
  "branchId": "clxbranch1"
}
```
**Nota:** Se envía email de invitación con link para crear contraseña.

### `PUT /v1/users/:id`
**Propósito:** Actualizar datos, rol o sucursal.

### `PUT /v1/users/:id/toggle`
**Propósito:** Activar o desactivar un usuario.

### `PUT /v1/users/me/password`
**Propósito:** El usuario cambia su propia contraseña.  
**Request:** `{ "currentPassword": "...", "newPassword": "..." }`

---

## Integraciones — `/v1/integrations`

---

### `GET /v1/integrations`
**Propósito:** Listar integraciones configuradas (WhatsApp, Gmail) del tenant.  
**Nota:** `token_encrypted` NUNCA aparece en la response.

### `POST /v1/integrations/whatsapp`
**Rol requerido:** `TENANT_ADMIN` o `BRANCH_ADMIN`  
**Propósito:** Conectar un número de WhatsApp Business.  
**Request:** `{ "branchId": "clxbranch1", "phoneNumberId": "103910...", "accessToken": "EAAx..." }`

### `POST /v1/integrations/gmail/oauth`
**Propósito:** Iniciar flujo OAuth2 para conectar Gmail.  
**Response 200:** `{ "authUrl": "https://accounts.google.com/o/oauth2/auth?..." }`

### `GET /v1/integrations/gmail/callback`
**Propósito:** Callback de OAuth2 de Google. Guarda el token cifrado.

### `DELETE /v1/integrations/:id`
**Propósito:** Desconectar una integración. Elimina el token cifrado.

### `POST /v1/integrations/:id/test`
**Propósito:** Verificar que la integración sigue activa (ping).  
**Response 200:** `{ "status": "active", "lastVerified": "2024-..." }`

---

## Webhooks — Sin prefijo `/v1/` · Sin autenticación JWT

Estos endpoints los llaman servicios externos (Meta, Google), no el frontend.

---

### `GET /webhook/whatsapp`
**Propósito:** Verificación del webhook por Meta al configurarlo.  
**Query params:** `hub.mode`, `hub.verify_token`, `hub.challenge`  
**Lógica:** Si `hub.verify_token` coincide con `WA_VERIFY_TOKEN`, responde con `hub.challenge`.

### `POST /webhook/whatsapp`
**Propósito:** Recibir mensajes entrantes de WhatsApp de todos los tenants.  
**Lógica:**
1. Verificar firma HMAC del request
2. Extraer `phone_number_id` del payload
3. Buscar en `integrations` el tenant que tiene ese `phone_number_id`
4. Poner el mensaje en la cola de BullMQ
5. Responder `200 OK` inmediatamente (Meta requiere respuesta en < 5 segundos)

### `POST /webhook/gmail`
**Propósito:** Recibir notificaciones de Google Pub/Sub cuando llega un email nuevo.  
**Lógica:** Similar al de WhatsApp — identifica tenant por email, encola, responde 200.

---

## ARI — Ventas · `/v1/ari`
**Feature flag requerido:** `ARI: true`

---

### Clientes

#### `GET /v1/ari/clients` 🤖
**Propósito:** Listar clientes del tenant con búsqueda y filtros.  
**Query:** `?search=juan&source=whatsapp&assignedTo=me&page=1&limit=20`

#### `GET /v1/ari/clients/:id` 🤖
**Propósito:** Ver ficha completa de un cliente con historial de interacciones, deals y cotizaciones.

#### `POST /v1/ari/clients` 🤖
**Propósito:** Crear cliente o lead manualmente (o desde el agente).  
**Request:** `{ "name", "phone", "email", "source", "whatsappId", "branchId" }`

#### `PUT /v1/ari/clients/:id`
#### `DELETE /v1/ari/clients/:id` — Soft delete

---

### Pipeline

#### `GET /v1/ari/pipeline/stages`
**Propósito:** Listar etapas del pipeline del tenant.

#### `POST /v1/ari/pipeline/stages`
**Rol requerido:** `AREA_MANAGER` del módulo ARI o superior  
**Propósito:** Crear nueva etapa personalizada.

#### `GET /v1/ari/deals` 🤖
**Propósito:** Listar deals. Por defecto los del usuario autenticado. AREA_MANAGER ve todos.  
**Query:** `?stageId=xxx&assignedTo=me&clientId=xxx`

#### `POST /v1/ari/deals` 🤖
**Propósito:** Crear nuevo deal (el agente lo usa cuando detecta intención de compra).  
**Request:** `{ "clientId", "stageId", "title", "value", "assignedTo" }`

#### `PUT /v1/ari/deals/:id/stage` 🤖
**Propósito:** Mover un deal a otra etapa del pipeline.  
**Request:** `{ "stageId": "clxstage2" }`  
**Efecto secundario:** Si la nueva etapa es `is_final_won: true`, genera una `transaction` de ingreso en VERA.

---

### Cotizaciones

#### `GET /v1/ari/quotes`
#### `GET /v1/ari/quotes/:id`

#### `POST /v1/ari/quotes` 🤖
**Propósito:** Crear cotización con líneas de productos.  
**Request:**
```json
{
  "clientId": "clxclient1",
  "dealId": "clxdeal1",
  "validUntil": "2024-12-31",
  "items": [
    { "productId": "clxprod1", "quantity": 20, "unitPrice": 5000, "discountPct": 0 }
  ]
}
```
**Efecto secundario:** Genera número de cotización automático (COT-YYYY-NNN).

#### `PUT /v1/ari/quotes/:id/status`
**Propósito:** Cambiar estado de la cotización.  
**Request:** `{ "status": "accepted" }`  
**Efecto secundario:** Si `accepted`, crea `transaction` de ingreso en VERA.

---

### Interacciones

#### `GET /v1/ari/clients/:id/interactions`
#### `POST /v1/ari/clients/:id/interactions` 🤖
**Request:** `{ "type": "note", "direction": "outbound", "content": "Llamé al cliente, interesado en el pedido" }`

---

### Reportes ARI

#### `GET /v1/ari/reports/sales`
**Query:** `?from=2024-01-01&to=2024-12-31&branchId=xxx`  
**Response:** `{ "totalSales", "totalDeals", "wonDeals", "lostDeals", "conversionRate", "byStage": [], "byVendor": [] }`

#### `GET /v1/ari/reports/pipeline`
**Response:** Valor total del pipeline por etapa.

---

## NIRA — Compras · `/v1/nira`
**Feature flag requerido:** `NIRA: true`

---

### Proveedores

#### `GET /v1/nira/suppliers` 🤖
#### `GET /v1/nira/suppliers/:id` 🤖
**Incluye:** Score del proveedor, historial de órdenes.

#### `POST /v1/nira/suppliers`
**Rol requerido:** `AREA_MANAGER` de NIRA o superior

#### `PUT /v1/nira/suppliers/:id`
#### `GET /v1/nira/suppliers/:id/score`
**Propósito:** Ver el score detallado del proveedor (precio, entrega, calidad).

---

### Órdenes de compra

#### `GET /v1/nira/purchase-orders` 🤖
**Query:** `?status=pending_approval&supplierId=xxx&branchId=xxx`

#### `POST /v1/nira/purchase-orders` 🤖
**Request:**
```json
{
  "supplierId": "clxsup1",
  "branchId": "clxbranch1",
  "expectedDelivery": "2024-12-15",
  "items": [
    { "productId": "clxprod1", "quantityOrdered": 100, "unitCost": 3500 }
  ]
}
```

#### `PUT /v1/nira/purchase-orders/:id/approve`
**Rol requerido:** `AREA_MANAGER` de NIRA o superior  
**Propósito:** Aprobar una OC. Genera `transaction` de egreso en VERA.

#### `PUT /v1/nira/purchase-orders/:id/receive`
**Propósito:** Registrar recepción (total o parcial) de una OC.  
**Request:** `{ "items": [{ "purchaseOrderItemId": "xxx", "quantityReceived": 80 }] }`  
**Efecto secundario:** Genera `stock_movement` de entrada en KIRA por cada ítem recibido.

#### `GET /v1/nira/purchase-orders/:id/compare`
**Propósito:** Comparar precios del mismo producto entre distintos proveedores.

---

### Reportes NIRA

#### `GET /v1/nira/reports/costs`
**Response:** `{ "totalSpent", "bySupplier": [], "byCategory": [], "byMonth": [] }`

#### `GET /v1/nira/reports/suppliers-ranking`
**Response:** Lista de proveedores ordenados por score descendente.

---

## KIRA — Inventario · `/v1/kira`
**Feature flag requerido:** `KIRA: true`

---

### Productos

#### `GET /v1/kira/products` 🤖
**Query:** `?category=xxx&abcClass=A&search=shampoo&branchId=xxx`  
**Nota:** Si se pasa `branchId`, incluye el stock de esa sucursal. Sin `branchId`, muestra stock de todas.

#### `GET /v1/kira/products/:id` 🤖
**Propósito:** Ver producto con stock por sucursal y últimos movimientos.

#### `POST /v1/kira/products`
**Rol requerido:** `AREA_MANAGER` de KIRA o superior

#### `PUT /v1/kira/products/:id`

---

### Stock

#### `GET /v1/kira/stock` 🤖
**Propósito:** Ver stock actual de todos los productos en todas las sucursales.  
**Query:** `?branchId=xxx&belowMin=true` (`belowMin=true` filtra solo los que están bajo mínimo)

#### `GET /v1/kira/stock/cross-branch/:productId` 🤖
**Propósito:** Ver stock de un producto en todas las sucursales (visibilidad cruzada).  
**Usado por:** ARI para verificar disponibilidad antes de cotizar.

#### `POST /v1/kira/stock/movements`
**Propósito:** Registrar entrada, salida o ajuste manual de stock.  
**Request:**
```json
{
  "productId": "clxprod1",
  "branchId": "clxbranch1",
  "type": "entrada",
  "quantity": 50,
  "notes": "Compra directa proveedor X",
  "lotNumber": "LOT-2024-001",
  "expiryDate": "2025-06-30"
}
```
**Validación:** No permite `quantity` negativo que deje el stock en menos de 0.

#### `GET /v1/kira/stock/movements`
**Propósito:** Historial completo de movimientos con filtros.  
**Query:** `?productId=xxx&branchId=xxx&type=salida&from=2024-01-01`

---

### Alertas

#### `GET /v1/kira/alerts`
**Propósito:** Listar productos con stock crítico (por debajo del mínimo) en tiempo real.  
**Response:** `{ "critical": [{ productId, productName, branchId, branchName, currentQty, minQty }] }`

---

### Reportes KIRA

#### `GET /v1/kira/reports/abc`
**Response:** Clasificación ABC del inventario con valor total por categoría.

#### `GET /v1/kira/reports/rotation`
**Response:** Velocidad de rotación por producto en el período.

---

## AGENDA — Agendamiento · `/v1/agenda`
**Feature flag requerido:** `AGENDA: true`

---

### Tipos de servicio

#### `GET /v1/agenda/service-types`
#### `POST /v1/agenda/service-types`
**Rol requerido:** `AREA_MANAGER` de AGENDA o superior

---

### Disponibilidad

#### `GET /v1/agenda/availability` 🤖
**Propósito:** Consultar horarios disponibles para agendar.  
**Query:** `?branchId=xxx&date=2024-12-15&serviceTypeId=xxx`  
**Response:** `{ "availableSlots": ["09:00", "09:30", "10:00", ...] }`

#### `PUT /v1/agenda/availability`
**Rol requerido:** `AREA_MANAGER` de AGENDA o superior  
**Propósito:** Configurar horarios de disponibilidad.

---

### Citas

#### `GET /v1/agenda/appointments`
**Query:** `?branchId=xxx&date=2024-12-15&status=scheduled&professionalId=xxx`

#### `POST /v1/agenda/appointments` 🤖
**Propósito:** Crear una cita. El agente la crea directamente desde WhatsApp.  
**Request:**
```json
{
  "branchId": "clxbranch1",
  "serviceTypeId": "clxservice1",
  "clientName": "Juan Pérez",
  "clientPhone": "+573001234567",
  "startAt": "2024-12-15T09:00:00-05:00",
  "channel": "whatsapp"
}
```
**Efecto secundario:** Envía confirmación por email/WhatsApp al cliente (vía Resend).

#### `PUT /v1/agenda/appointments/:id/status`
**Request:** `{ "status": "confirmed" | "cancelled" | "completed" | "no_show" }`

---

## VERA — Finanzas · `/v1/vera`
**Feature flag requerido:** `VERA: true`

---

### Transacciones

#### `GET /v1/vera/transactions`
**Query:** `?type=income&from=2024-01-01&to=2024-12-31&branchId=xxx`

#### `GET /v1/vera/dashboard`
**Propósito:** KPIs financieros consolidados para el dashboard ejecutivo.  
**Response:**
```json
{
  "totalIncome": 15000000,
  "totalExpense": 8000000,
  "netBalance": 7000000,
  "byMonth": [{ "month": "2024-01", "income": 1200000, "expense": 600000 }],
  "byBranch": [{ "branchId", "branchName", "income", "expense" }]
}
```

#### `GET /v1/vera/reports/income-statement`
**Propósito:** Estado de resultados del período.  
**Query:** `?from=2024-01-01&to=2024-12-31`

---

## Notificaciones — `/v1/notifications`

---

### `GET /v1/notifications`
**Propósito:** Notificaciones del usuario autenticado.  
**Query:** `?isRead=false&limit=20`

### `PUT /v1/notifications/:id/read`
**Propósito:** Marcar una notificación como leída.

### `PUT /v1/notifications/read-all`
**Propósito:** Marcar todas como leídas.

### `GET /v1/notifications/unread-count`
**Propósito:** Número de notificaciones no leídas (usado para el badge del header).  
**Response:** `{ "count": 5 }`

---

## Resumen de roles por endpoint

| Endpoint | SUPER_ADMIN | TENANT_ADMIN | BRANCH_ADMIN | AREA_MANAGER | OPERATIVE |
|----------|-------------|--------------|--------------|--------------|-----------|
| `/v1/admin/*` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/v1/tenants/feature-flags PUT` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/v1/branches POST` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/v1/users POST` | ✅ | ✅ | ✅ (su sucursal) | ❌ | ❌ |
| `/v1/ari/deals PUT stage` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/v1/nira/purchase-orders/:id/approve` | ✅ | ✅ | ✅ | ✅ NIRA | ❌ |
| `/v1/kira/products POST` | ✅ | ✅ | ✅ | ✅ KIRA | ❌ |
| `/v1/kira/stock/movements POST` | ✅ | ✅ | ✅ | ✅ | ✅ KIRA |
