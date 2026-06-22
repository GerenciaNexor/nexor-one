# README_DATABASE — Arquitectura de Base de Datos NEXOR V1

> **Versión:** V1 Final  
> **Motor:** PostgreSQL  
> **ORM:** Prisma  
> **Patrón multi-tenancy:** Base de datos compartida con `tenant_id` en cada tabla + Row-Level Security (RLS)  
> **Modelos:** ≈35 (PENDIENTE: recuento exacto contra `apps/api/prisma/schema.prisma`). Incluye las tablas de bandeja y auditoría documentadas más abajo (`bulk_upload_logs`, `chat_messages`, `conversations`, `conversation_messages`).

---

## Principio fundamental

Todos los datos de todos los clientes (tenants) viven en la misma base de datos. Lo que los separa es el campo `tenant_id` presente en **cada tabla de negocio con relación directa al tenant**. PostgreSQL enforcea este aislamiento a nivel de base de datos mediante Row-Level Security (RLS), lo que significa que aunque un bug de código intente acceder a datos de otro tenant, la DB lo rechaza.

**Regla general:** Toda tabla de negocio con relación directa al tenant debe tener `tenant_id` y su política RLS correspondiente.

**Excepción — tablas hijas:** Las tablas de detalle que solo existen como hijas de una tabla con `tenant_id` no necesitan repetirlo. Su aislamiento se hereda por FK del padre. Estas tablas son:

| Tabla hija | Tabla padre (tiene tenant_id) |
|------------|-------------------------------|
| `stocks` | `products` + `branches` |
| `quote_items` | `quotes` |
| `purchase_order_items` | `purchase_orders` |
| `supplier_scores` | `suppliers` |

Estas 4 tablas no tienen RLS propio — nunca se consultan de forma independiente sin pasar primero por la tabla padre, que ya está filtrada por tenant.

---

## Diagrama de relaciones

```
Tenant (1)
  ├── Branch (N)           → sucursales de la empresa
  ├── User (N)             → usuarios de todos los roles
  ├── FeatureFlag (N)      → módulos activos por tenant
  ├── Integration (N)      → WhatsApp/Gmail conectados
  ├── AgentLog (N)         → historial de acciones de la IA
  ├── Notification (N)     → notificaciones in-app
  ├── BulkUploadLog (N)    → auditoría de cargas masivas (append-only)
  ├── ChatMessage (N)      → chat interno dashboard ↔ agente (append-only)
  ├── Conversation (N)     → hilos de bandeja (WhatsApp/Gmail)
  │     └── ConversationMessage (N) → mensajes del hilo (append-only)
  │
  ├── [ARI] Client (N)
  │     ├── Interaction (N)
  │     ├── Quote (N)
  │     │     └── QuoteItem (N) → Product
  │     └── PipelineDeal (N)
  │
  ├── [NIRA] Supplier (N)
  │     ├── PurchaseOrder (N)
  │     │     └── PurchaseOrderItem (N) → Product
  │     └── SupplierScore (1)
  │
  ├── [KIRA] Product (N)
  │     ├── Stock (N)       → Branch
  │     └── StockMovement (N) → Branch, User
  │
  ├── [AGENDA] Appointment (N) → Branch, User (profesional)
  │
  └── [VERA] Transaction (N)   → generada por ARI y NIRA
```

---

## Tablas — Especificación completa

### CORE (compartidas por todos los módulos)

---

#### `tenants`

Representa a cada empresa cliente que usa NEXOR. Es el nodo raíz de toda la jerarquía de datos.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID generado automáticamente |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre comercial de la empresa |
| `slug` | `VARCHAR(100)` | UNIQUE, NOT NULL | Identificador único para URLs (ej: `farmacia-lopez`) |
| `legal_name` | `VARCHAR(255)` | NULL | Nombre legal / razón social |
| `tax_id` | `VARCHAR(50)` | NULL | NIT / RUT / identificación fiscal |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el tenant puede acceder al sistema |
| `timezone` | `VARCHAR(50)` | NOT NULL, DEFAULT 'America/Bogota' | Zona horaria para fechas y reportes |
| `currency` | `VARCHAR(3)` | NOT NULL, DEFAULT 'COP' | Moneda local (ISO 4217) |
| `logo_url` | `VARCHAR(500)` | NULL | URL del logo para cotizaciones |
| `default_supplier_id` | `VARCHAR(30)` | NULL, FK → suppliers.id (ON DELETE SET NULL) | Proveedor preferido **global** del tenant — respaldo cuando un producto no tiene preferido propio (HU-123) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `slug` (UNIQUE)  
**Notas:** Esta tabla NO tiene `tenant_id` — es la raíz. RLS no aplica aquí. Solo el Super Admin puede leer todos los registros.

---

#### `branches`

Sucursales de cada empresa. El inventario, los usuarios operativos y las integraciones de WhatsApp/Gmail se asignan por sucursal.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa a la que pertenece |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre de la sucursal (ej: "Sede Norte") |
| `city` | `VARCHAR(100)` | NULL | Ciudad |
| `address` | `VARCHAR(500)` | NULL | Dirección completa |
| `phone` | `VARCHAR(20)` | NULL | Teléfono de contacto de la sucursal |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si la sucursal está operativa |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(tenant_id, is_active)`  
**RLS:** Solo usuarios del mismo `tenant_id` pueden ver estas filas.

---

#### `users`

Todos los usuarios del sistema, de todos los roles y tenants.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa a la que pertenece |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal asignada (NULL = acceso a todas) |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Email (usado para login) |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre completo |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Hash bcrypt de la contraseña |
| `role` | `ENUM` | NOT NULL | Ver enum `Role` abajo |
| `module` | `ENUM` | NULL | Módulo principal (solo para AREA_MANAGER y OPERATIVE) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el usuario puede iniciar sesión |
| `last_login_at` | `TIMESTAMPTZ` | NULL | Último acceso al sistema |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(email)` UNIQUE, `(tenant_id)`, `(tenant_id, role)`, `(branch_id)`  
**Enum `Role`:** `SUPER_ADMIN | TENANT_ADMIN | BRANCH_ADMIN | AREA_MANAGER | OPERATIVE`  
**Enum `Module`:** `ARI | NIRA | KIRA | AGENDA | VERA`  
**RLS:** Solo usuarios del mismo `tenant_id`. SUPER_ADMIN ve todos.

---

#### `feature_flags`

Controla qué módulos están activos para cada tenant. Permite activar/desactivar funcionalidades sin tocar código.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `module` | `ENUM(Module)` | NOT NULL | Módulo (ARI, NIRA, KIRA, AGENDA, VERA) |
| `enabled` | `BOOLEAN` | NOT NULL, DEFAULT false | Si el módulo está activo |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `UNIQUE(tenant_id, module)`  
**Notas:** Se crea un registro por cada módulo al crear el tenant. El onboarding activa los módulos contratados.

---

#### `integrations`

Tokens y configuración de las integraciones externas (WhatsApp Business, Gmail) por tenant y sucursal.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal (NULL = aplica a toda la empresa) |
| `channel` | `ENUM` | NOT NULL | `WHATSAPP` o `GMAIL` |
| `identifier` | `VARCHAR(255)` | NOT NULL | Número de WA o email según canal |
| `token_encrypted` | `TEXT` | NULL | Token de acceso cifrado con AES-256 |
| `metadata` | `JSONB` | NULL | Datos adicionales del canal (phone_number_id, etc.) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT false | Si la integración está conectada |
| `last_verified_at` | `TIMESTAMPTZ` | NULL | Última verificación exitosa del token |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(channel, identifier)` — este último es el que usa el webhook para identificar el tenant  
**Seguridad:** `token_encrypted` NUNCA se devuelve en responses de la API. Solo se usa internamente.

---

#### `agent_logs`

Registro inmutable de cada acción tomada por cualquier agente de IA. Obligatorio para auditoría y mejora del modelo.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `module` | `ENUM(Module)` | NOT NULL | Qué agente actuó (ARI, NIRA, KIRA, AGENDA) |
| `channel` | `VARCHAR(50)` | NOT NULL | Canal de entrada (whatsapp, gmail, internal) |
| `input_message` | `TEXT` | NOT NULL | Mensaje original recibido |
| `reply` | `TEXT` | NULL | Respuesta enviada al usuario |
| `tools_used` | `VARCHAR[]` | NOT NULL, DEFAULT '{}' | Array con nombres de las tools ejecutadas |
| `tool_details` | `JSONB` | NOT NULL | Detalle de cada tool: input, output, timestamp |
| `turn_count` | `INTEGER` | NOT NULL, DEFAULT 1 | Número de turnos del bucle tool use |
| `duration_ms` | `INTEGER` | NULL | Tiempo total de procesamiento en ms |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Timestamp de la interacción |

**Índices:** `(tenant_id)`, `(tenant_id, module)`, `(created_at DESC)`  
**Notas:** Esta tabla es APPEND-ONLY. Nunca se actualiza ni se elimina un registro.

---

#### `notifications`

Notificaciones in-app por usuario. Generadas por el sistema, los jobs y los agentes de IA.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `user_id` | `VARCHAR(30)` | FK → users.id, NOT NULL | Usuario destinatario |
| `module` | `ENUM(Module)` | NULL | Módulo que generó la notificación |
| `type` | `VARCHAR(50)` | NOT NULL | Tipo (stock_alert, new_lead, appointment, etc.) |
| `title` | `VARCHAR(255)` | NOT NULL | Título corto de la notificación |
| `message` | `TEXT` | NOT NULL | Descripción completa |
| `link` | `VARCHAR(500)` | NULL | URL interna de acción (ej: /kira/products/123) |
| `is_read` | `BOOLEAN` | NOT NULL, DEFAULT false | Si el usuario ya la leyó |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo fue generada |

**Índices:** `(tenant_id, user_id, is_read)`, `(created_at DESC)`

---

#### `bulk_upload_logs`

Auditoría de las cargas masivas (importación de datos por archivo) ejecutadas en el sistema. Tabla APPEND-ONLY.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `user_id` | `VARCHAR(30)` | FK → users.id, NOT NULL | Usuario que ejecutó la carga |
| `type` | `VARCHAR(50)` | NOT NULL | Tipo de carga masiva (qué entidad se importa) |
| `file_name` | `VARCHAR` | NOT NULL | Nombre del archivo subido |
| `file_size` | `INTEGER` | NULL | Tamaño del archivo en bytes |
| `row_count` | `INTEGER` | NULL | Número de filas detectadas en el archivo |
| `record_count` | `INTEGER` | NOT NULL, DEFAULT 0 | Número de registros efectivamente procesados |
| `status` | `VARCHAR(20)` | NOT NULL | Estado del proceso — valores observados: `preview`, `processing`, `success`, `failed` (PENDIENTE: confirmar set completo) |
| `errors` | `JSONB` | NULL | Detalle de los errores encontrados durante la carga |
| `file_data` | `BYTES` | NULL | Contenido binario del archivo original |
| `finished_at` | `TIMESTAMPTZ` | NULL | Cuándo terminó el procesamiento |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo se inició la carga |

**Índices:** `(tenant_id)`, `(tenant_id, type)`, `(tenant_id, status)`, `(created_at DESC)`  
**Notas:** Esta tabla es APPEND-ONLY — solo se registra el historial de cargas, no se edita.  
**RLS:** SÍ. RLS + política `tenant_isolation` aplicadas en HU-114 (Sprint 12) vía la migración `20260618000000_rls_inbox_bulkupload` y `setup-rls.ts` (`db:rls`). Es una capa adicional al filtrado explícito por `tenant_id` en los servicios.

---

#### `chat_messages`

Historial del chat interno del dashboard entre los empleados y el agente de IA. Tabla APPEND-ONLY.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `user_id` | `VARCHAR(30)` | FK → users.id, NOT NULL | Empleado dueño del hilo de chat |
| `role` | `VARCHAR(20)` | NOT NULL | `user` = mensaje del empleado \| `assistant` = respuesta del agente |
| `content` | `TEXT` | NOT NULL | Contenido del mensaje |
| `module` | `ENUM(Module)` | NULL | Módulo del mensaje (presente solo en mensajes con `role = 'user'`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo se envió el mensaje |

**Índices:** `(tenant_id, user_id, created_at DESC)`  
**Notas:** Esta tabla es APPEND-ONLY.  
**RLS:** SÍ. La política `tenant_isolation` la crea la migración `20260411131542_chat_messages_rls_and_index` y, desde HU-117, también la re-aplica `setup-rls.ts` (`db:rls`) de forma idempotente — así ninguna tabla queda sin RLS tras un restore.

---

#### `conversations`

Hilo de la bandeja de entrada, agrupado por remitente y canal. Representa una conversación con un contacto externo a través de WhatsApp o Gmail.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `channel` | `ENUM(Channel)` | NOT NULL | `WHATSAPP` o `GMAIL` |
| `sender_identifier` | `VARCHAR(255)` | NOT NULL | Identificador del remitente (número de WA o email) |
| `sender_name` | `VARCHAR` | NULL | Nombre del remitente |
| `related_module` | `ENUM(Module)` | NULL | Módulo relacionado con la conversación |
| `status` | `VARCHAR(20)` | NOT NULL, DEFAULT 'open' | `open`, `replied`, `resolved`, `reassigned` — lo cambia el equipo humano; el agente NUNCA lo cambia |
| `assigned_to` | `VARCHAR(30)` | FK → users.id, NULL | Usuario asignado para atender la conversación |
| `last_message_at` | `TIMESTAMPTZ` | NOT NULL | Fecha del último mensaje del hilo |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, channel, sender_identifier)`, `(tenant_id, status)`, `(last_message_at DESC)`  
**Notas de agrupación:** WhatsApp agrupa los mensajes por número en una ventana de 24h de inactividad; Gmail agrupa por email sin límite de tiempo.  
**RLS:** SÍ. RLS + política `tenant_isolation` aplicadas en HU-114 (Sprint 12) vía la migración `20260618000000_rls_inbox_bulkupload` y `setup-rls.ts` (`db:rls`). Es una capa adicional al filtrado explícito por `tenant_id` en los servicios.

---

#### `conversation_messages`

Mensaje individual dentro de una `conversation`. Tabla APPEND-ONLY.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `conversation_id` | `VARCHAR(30)` | FK → conversations.id, NOT NULL | Conversación a la que pertenece |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `direction` | `VARCHAR(10)` | NOT NULL | `inbound` (entrante) / `outbound` (saliente) |
| `content` | `TEXT` | NOT NULL | Contenido del mensaje |
| `message_type` | `VARCHAR(20)` | NOT NULL, DEFAULT 'text' | `text`, `image`, `document` |
| `is_from_agent` | `BOOLEAN` | NOT NULL, DEFAULT false | Si el mensaje lo generó el agente de IA |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Usuario emisor (presente solo si es `outbound` y NO es del agente) |
| `external_message_id` | `VARCHAR` | NULL | ID externo del mensaje (`wamid` de Meta o `messageId` de Gmail) |
| `timestamp` | `TIMESTAMPTZ` | NOT NULL | Marca de tiempo del mensaje |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo se registró en NEXOR |

**Índices:** `(conversation_id, timestamp ASC)`, `(tenant_id)`, `(external_message_id)`  
**Notas:** Esta tabla es APPEND-ONLY.  
**RLS:** SÍ. RLS + política `tenant_isolation` aplicadas en HU-114 (Sprint 12) vía la migración `20260618000000_rls_inbox_bulkupload` y `setup-rls.ts` (`db:rls`). Es una capa adicional al filtrado explícito por `tenant_id` en los servicios.

---

### MÓDULO ARI — Ventas y CRM

---

#### `clients`

Clientes y prospectos de la empresa. Un cliente puede existir aunque nunca haya comprado (lead).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre completo o razón social |
| `email` | `VARCHAR(255)` | NULL | Email de contacto |
| `phone` | `VARCHAR(20)` | NULL | Teléfono (puede ser el número de WhatsApp) |
| `whatsapp_id` | `VARCHAR(50)` | NULL | ID de WhatsApp para identificar mensajes entrantes |
| `company` | `VARCHAR(255)` | NULL | Empresa del cliente (si es B2B) |
| `tax_id` | `VARCHAR(50)` | NULL | NIT/cédula del cliente |
| `address` | `VARCHAR(500)` | NULL | Dirección |
| `city` | `VARCHAR(100)` | NULL | Ciudad |
| `source` | `VARCHAR(50)` | NULL | Origen: whatsapp, email, manual, referido |
| `tags` | `VARCHAR[]` | NOT NULL, DEFAULT '{}' | Etiquetas libres |
| `notes` | `TEXT` | NULL | Notas internas sobre el cliente |
| `assigned_to` | `VARCHAR(30)` | FK → users.id, NULL | Vendedor asignado |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal que lo atiende |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el cliente está activo |
| `is_favorite` | `BOOLEAN` | NOT NULL, DEFAULT false | Cliente favorito (HU-124) |
| `discount_type` | `VARCHAR(10)` | NULL | `'percent'` (0-100) \| `'amount'` (monto fijo) \| NULL (HU-124) |
| `discount_value` | `DECIMAL(15,2)` | NULL | Valor del descuento manual preferente; NULL si no hay (HU-124) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(tenant_id, assigned_to)`, `(whatsapp_id)`, `(tenant_id, is_active)`, `(tenant_id, is_favorite)`

**Favorito + descuento (HU-124):** marca informativa para el equipo de ventas. `discount_type` y
`discount_value` van juntos (ambos NULL = sin descuento). El descuento **no** dispara envíos
automáticos al cliente (fuera de alcance: depende de plantillas Meta). Cubierto por el RLS de `clients`.

---

#### `pipeline_stages`

Etapas configurables del embudo de ventas por tenant. Por defecto: Lead → Contactado → Negociación → Ganado → Facturado → Perdido.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `name` | `VARCHAR(100)` | NOT NULL | Nombre de la etapa |
| `order` | `INTEGER` | NOT NULL | Orden en el kanban (1, 2, 3...) |
| `color` | `VARCHAR(7)` | NULL | Color hex para el kanban |
| `is_final_won` | `BOOLEAN` | NOT NULL, DEFAULT false | Indica que el deal fue ganado |
| `is_final_lost` | `BOOLEAN` | NOT NULL, DEFAULT false | Indica que el deal fue perdido |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |

**Índices:** `(tenant_id, order)`

---

#### `deals`

Oportunidades de venta en el pipeline. Cada deal representa una negociación con un cliente.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente asociado |
| `stage_id` | `VARCHAR(30)` | FK → pipeline_stages.id, NOT NULL | Etapa actual del pipeline |
| `assigned_to` | `VARCHAR(30)` | FK → users.id, NULL | Vendedor responsable |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal |
| `title` | `VARCHAR(255)` | NOT NULL | Título del deal (ej: "Pedido 20 shampoo") |
| `value` | `DECIMAL(15,2)` | NULL | Valor estimado de la venta |
| `probability` | `INTEGER` | NULL, CHECK(0-100) | Probabilidad de cierre en % |
| `expected_close` | `DATE` | NULL | Fecha esperada de cierre |
| `lost_reason` | `TEXT` | NULL | Razón de pérdida (si aplica) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |
| `closed_at` | `TIMESTAMPTZ` | NULL | Cuándo se cerró (ganado o perdido) |

**Índices:** `(tenant_id, stage_id)`, `(tenant_id, assigned_to)`, `(client_id)`

---

#### `interactions`

Historial de comunicaciones con cada cliente (mensajes WhatsApp, emails, llamadas, notas).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente |
| `deal_id` | `VARCHAR(30)` | FK → deals.id, NULL | Deal asociado (opcional) |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Usuario que registró (NULL = agente IA) |
| `type` | `VARCHAR(50)` | NOT NULL | whatsapp, email, call, note, meeting |
| `direction` | `VARCHAR(10)` | NOT NULL | inbound / outbound |
| `content` | `TEXT` | NOT NULL | Contenido del mensaje o nota |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo ocurrió |

**Índices:** `(tenant_id, client_id)`, `(created_at DESC)`

---

#### `quotes`

Cotizaciones generadas para los clientes.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente |
| `deal_id` | `VARCHAR(30)` | FK → deals.id, NULL | Deal asociado |
| `created_by` | `VARCHAR(30)` | FK → users.id, NOT NULL | Quien la creó |
| `quote_number` | `VARCHAR(50)` | NOT NULL | Número de cotización (COT-2024-001) |
| `status` | `VARCHAR(30)` | NOT NULL, DEFAULT 'draft' | draft, sent, accepted, rejected, expired |
| `subtotal` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Subtotal sin impuestos |
| `discount` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Descuento total |
| `tax` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Impuestos |
| `total` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Total final |
| `valid_until` | `DATE` | NULL | Fecha de validez |
| `notes` | `TEXT` | NULL | Notas adicionales para el cliente |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, client_id)`, `(tenant_id, status)`, `UNIQUE(tenant_id, quote_number)`

---

#### `quote_items`

Líneas de cada cotización. Referencia al catálogo de productos al momento de crearla.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `quote_id` | `VARCHAR(30)` | FK → quotes.id, NOT NULL | Cotización |
| `product_id` | `VARCHAR(30)` | FK → products.id, NULL | Producto del catálogo (NULL si es libre) |
| `description` | `VARCHAR(500)` | NOT NULL | Descripción del ítem |
| `quantity` | `DECIMAL(10,2)` | NOT NULL | Cantidad |
| `unit_price` | `DECIMAL(15,2)` | NOT NULL | Precio unitario al momento de cotizar |
| `discount_pct` | `DECIMAL(5,2)` | NOT NULL, DEFAULT 0 | Descuento en % |
| `total` | `DECIMAL(15,2)` | NOT NULL | Total de la línea |

**Índices:** `(quote_id)`

---

#### `client_ratings`

Calificación **interna** del equipo de ventas al cliente al cerrar la venta (HU-126). Disparador:
deal en etapa **ganada** (`isFinalWon`). Una por deal. **No** es el CSAT del cliente. RLS por
`tenant_id` (alta en `setup-rls.ts`).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa (RLS) |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente calificado |
| `deal_id` | `VARCHAR(30)` | FK → deals.id, UNIQUE, NULL | Deal ganado (una calificación por deal) |
| `rating` | `SMALLINT` | NOT NULL | Escala 1-5 (interna) |
| `notes` | `TEXT` | NULL | Observaciones |
| `rated_by` | `VARCHAR(30)` | FK → users.id, NOT NULL | Quién calificó |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha |

**Índices:** `(deal_id)` UNIQUE, `(tenant_id, client_id)`, `(created_at DESC)`

---

### MÓDULO NIRA — Compras

---

#### `suppliers`

Proveedores de la empresa.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre del proveedor |
| `contact_name` | `VARCHAR(255)` | NULL | Nombre del contacto |
| `email` | `VARCHAR(255)` | NULL | Email |
| `phone` | `VARCHAR(20)` | NULL | Teléfono |
| `tax_id` | `VARCHAR(50)` | NULL | NIT del proveedor |
| `address` | `VARCHAR(500)` | NULL | Dirección |
| `city` | `VARCHAR(100)` | NULL | Ciudad |
| `payment_terms` | `INTEGER` | NULL | Días de crédito (ej: 30, 60, 90) |
| `notes` | `TEXT` | NULL | Notas internas |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el proveedor está activo |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(tenant_id, is_active)`

---

#### `supplier_scores`

Puntuación calculada para cada proveedor. Se recalcula al **calificar una OC recibida** (HU-125) y a diario.
Los ejes son **NULLABLE**: `NULL` = "sin datos" (no engañoso). Ver la fórmula de cada eje en
[README_MODULES.md](./README_MODULES.md) (sección NIRA).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `supplier_id` | `VARCHAR(30)` | FK → suppliers.id, UNIQUE, NOT NULL | Proveedor (1 a 1) |
| `price_score` | `DECIMAL(4,2)` | NULL | Eje Precio (0-10), objetivo del histórico. NULL = sin datos |
| `delivery_score` | `DECIMAL(4,2)` | NULL | Eje Entrega (0-10), de las calificaciones. NULL = sin datos |
| `quality_score` | `DECIMAL(4,2)` | NULL | Eje Calidad (0-10), de las calificaciones. NULL = sin datos |
| `overall_score` | `DECIMAL(4,2)` | NULL | Promedio de los ejes con datos. NULL si ninguno |
| `total_orders` | `INTEGER` | NOT NULL, DEFAULT 0 | OC recibidas (informativo) |
| `on_time_deliveries` | `INTEGER` | NOT NULL, DEFAULT 0 | Entregas a tiempo (informativo, NO alimenta el score) |
| `ratings_count` | `INTEGER` | NOT NULL, DEFAULT 0 | Nº de calificaciones recibidas (HU-125) |
| `calculated_at` | `TIMESTAMPTZ` | NOT NULL | Última vez que se calculó |

---

#### `supplier_ratings`

Calificación manual del proveedor al recibir una OC (HU-125). Fuente explícita de los ejes
**Entrega** y **Calidad** del score. Tiene RLS por `tenant_id` (alta en `setup-rls.ts`).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa (RLS) |
| `supplier_id` | `VARCHAR(30)` | FK → suppliers.id, NOT NULL | Proveedor calificado |
| `purchase_order_id` | `VARCHAR(30)` | FK → purchase_orders.id, UNIQUE, NULL | OC calificada (una calificación por OC) |
| `delivery_rating` | `SMALLINT` | NOT NULL | Entrega, escala 1-5 |
| `quality_rating` | `SMALLINT` | NOT NULL | Calidad, escala 1-5 |
| `notes` | `TEXT` | NULL | Observaciones |
| `rated_by` | `VARCHAR(30)` | FK → users.id, NOT NULL | Quién calificó |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha |

**Índices:** `(purchase_order_id)` UNIQUE, `(tenant_id, supplier_id)`, `(created_at DESC)`

---

#### `purchase_orders`

Órdenes de compra emitidas a los proveedores.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `supplier_id` | `VARCHAR(30)` | FK → suppliers.id, NOT NULL | Proveedor |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal que recibe |
| `created_by` | `VARCHAR(30)` | FK → users.id, NOT NULL | Quien la creó |
| `approved_by` | `VARCHAR(30)` | FK → users.id, NULL | Quien la aprobó |
| `order_number` | `VARCHAR(50)` | NOT NULL | Número de OC (OC-2024-001) |
| `status` | `VARCHAR(30)` | NOT NULL, DEFAULT 'draft' | draft, submitted, approved, sent, partial, received, cancelled |
| `subtotal` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Subtotal |
| `tax` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Impuestos |
| `total` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Total |
| `expected_delivery` | `DATE` | NULL | Fecha de entrega esperada |
| `delivered_at` | `TIMESTAMPTZ` | NULL | Fecha real de entrega |
| `notes` | `TEXT` | NULL | Notas |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, status)`, `(tenant_id, supplier_id)`, `UNIQUE(tenant_id, order_number)`  
**Regla de negocio:** Solo usuarios con rol `AREA_MANAGER` del módulo NIRA o superior pueden cambiar status a `approved`.

**Estados — vocabulario canónico y transiciones válidas (HU-116):**

```
draft ──submit──► submitted ──approve──► approved ──┬──► (sent) ──┐
                                                    └──receive──► partial ──receive──► received
cancelled ◄── (draft | submitted | approved | sent | partial)
```

| Estado | Significado | Transición que lo produce |
|--------|-------------|---------------------------|
| `draft` | Borrador en edición | `POST /v1/nira/purchase-orders` |
| `submitted` | Enviada a aprobación | `POST /:id/submit` (requiere proveedor + ítems) |
| `approved` | Aprobada — genera egreso (`transaction`) en VERA | `PUT /:id/approve` (AREA_MANAGER NIRA+) |
| `sent` | Enviada al proveedor | (manual / reservado) |
| `partial` | Recepción parcial | `PUT /:id/receive` (recepción incompleta) |
| `received` | Recibida — genera entrada (`stock_movement`) en KIRA | `PUT /:id/receive` (recepción completa) |
| `cancelled` | Cancelada — revierte el egreso en VERA si ya estaba aprobada | `PUT /:id/cancel` |

> Pares unificados en HU-116: `pending_approval` → **`submitted`** (coherente con el endpoint `.../submit`)
> y `delivered` → **`received`** (coherente con `.../receive`). La migración
> `20260618000001_unify_po_status` renombró los estados ya persistidos.

---

#### `purchase_order_items`

Líneas de cada orden de compra.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `purchase_order_id` | `VARCHAR(30)` | FK → purchase_orders.id, NOT NULL | OC |
| `product_id` | `VARCHAR(30)` | FK → products.id, NOT NULL | Producto |
| `quantity_ordered` | `DECIMAL(10,2)` | NOT NULL | Cantidad ordenada |
| `quantity_received` | `DECIMAL(10,2)` | NOT NULL, DEFAULT 0 | Cantidad efectivamente recibida |
| `unit_cost` | `DECIMAL(15,2)` | NOT NULL | Costo unitario pactado |
| `total` | `DECIMAL(15,2)` | NOT NULL | Total de la línea |

**Índices:** `(purchase_order_id)`, `(product_id)`  
**Notas:** Cuando `quantity_received` iguala `quantity_ordered` en todas las líneas, la OC pasa a `received` y se genera automáticamente un `stock_movement` de entrada en KIRA.

---

### MÓDULO KIRA — Inventario

---

#### `products`

Catálogo global de productos por tenant. El stock es por sucursal, pero el producto es único.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `sku` | `VARCHAR(100)` | NOT NULL | Código único del producto |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre del producto |
| `description` | `TEXT` | NULL | Descripción detallada |
| `category` | `VARCHAR(100)` | NULL | Categoría |
| `unit` | `VARCHAR(50)` | NOT NULL, DEFAULT 'unidad' | Unidad de medida (unidad, kg, litro...) |
| `sale_price` | `DECIMAL(15,2)` | NULL | Precio de venta |
| `cost_price` | `DECIMAL(15,2)` | NULL | Costo promedio |
| `min_stock` | `INTEGER` | NOT NULL, DEFAULT 0 | Mínimo de stock — alerta si baja de aquí |
| `max_stock` | `INTEGER` | NULL | Máximo de stock — alerta si supera aquí |
| `abc_class` | `VARCHAR(1)` | NULL | Clasificación ABC (A, B, C) calculada automáticamente |
| `preferred_supplier_id` | `VARCHAR(30)` | NULL, FK → suppliers.id (ON DELETE SET NULL) | Proveedor **preferido** del producto — NIRA lo prioriza al reabastecer (HU-123) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el producto está activo |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `UNIQUE(tenant_id, sku)`, `(tenant_id, is_active)`, `(tenant_id, category)`, `(tenant_id, abc_class)`, `(preferred_supplier_id)`

**Preferencia de proveedor (HU-123):** la resolución que usa el agente NIRA es
`preferred_supplier_id` del producto → `tenants.default_supplier_id` (global) → sin preferencia.
La columna está cubierta por el RLS existente de `products`; la FK usa `ON DELETE SET NULL` (si el
proveedor se borra, el producto queda sin preferido en vez de fallar).

> **Nota de rendimiento (HU-093):** El índice `(tenant_id, is_active)` es crítico para KIRA. Toda query de inventario filtra `{ tenantId, isActive: true }` y sin él el planner hacía sequential scan sobre toda la tabla del tenant. Migración: `20260422000000_perf_indexes`.

---

#### `stocks`

Stock actual de cada producto en cada sucursal. Es la única fuente de verdad del inventario en tiempo real.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `product_id` | `VARCHAR(30)` | FK → products.id, NOT NULL | Producto |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NOT NULL | Sucursal |
| `quantity` | `DECIMAL(10,2)` | NOT NULL, DEFAULT 0 | Cantidad actual en stock |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última actualización |

**Índices:** `UNIQUE(product_id, branch_id)`, `(branch_id)`  
**Regla de negocio:** `quantity` NUNCA puede ser negativo. Validar en la capa de servicio antes de guardar.

---

#### `stock_movements`

Historial inmutable de cada cambio en el inventario. Trazabilidad completa.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `product_id` | `VARCHAR(30)` | FK → products.id, NOT NULL | Producto |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NOT NULL | Sucursal donde ocurrió el movimiento |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Usuario responsable (NULL = sistema) |
| `type` | `VARCHAR(30)` | NOT NULL | entrada, salida, ajuste, transferencia, merma |
| `quantity` | `DECIMAL(10,2)` | NOT NULL | Cantidad del movimiento (positivo=entrada, negativo=salida) |
| `quantity_before` | `DECIMAL(10,2)` | NOT NULL | Stock antes del movimiento |
| `quantity_after` | `DECIMAL(10,2)` | NOT NULL | Stock después del movimiento |
| `reference_type` | `VARCHAR(50)` | NULL | Tipo de referencia (purchase_order, quote, manual) |
| `reference_id` | `VARCHAR(30)` | NULL | ID del documento que generó el movimiento |
| `lot_number` | `VARCHAR(100)` | NULL | Número de lote |
| `expiry_date` | `DATE` | NULL | Fecha de caducidad del lote |
| `notes` | `TEXT` | NULL | Notas del movimiento |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo ocurrió |

**Índices:** `(tenant_id, product_id)`, `(branch_id)`, `(created_at DESC)`, `(reference_type, reference_id)`  
**Notas:** Esta tabla es APPEND-ONLY. Nunca se modifica ni elimina un movimiento.

---

### MÓDULO AGENDA — Agendamiento

---

#### `service_types`

Tipos de servicios o citas que ofrece la empresa (ej: "Consulta médica", "Corte de cabello").

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal (NULL = todas) |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre del servicio |
| `duration_minutes` | `INTEGER` | NOT NULL, DEFAULT 30 | Duración en minutos |
| `price` | `DECIMAL(15,2)` | NULL | Precio del servicio |
| `color` | `VARCHAR(7)` | NULL | Color en el calendario |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el servicio está disponible |

**Índices:** `(tenant_id)`, `(tenant_id, branch_id)`

---

#### `availability`

Horarios de disponibilidad configurados por sucursal o profesional.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Profesional (NULL = sucursal general) |
| `day_of_week` | `INTEGER` | NOT NULL, CHECK(0-6) | 0=Domingo, 1=Lunes... 6=Sábado |
| `start_time` | `TIME` | NOT NULL | Hora de inicio (ej: 08:00) |
| `end_time` | `TIME` | NOT NULL | Hora de fin (ej: 18:00) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si este horario está vigente |

**Índices:** `(tenant_id, branch_id, day_of_week)`

---

#### `appointments`

Citas agendadas. El agente de IA puede crearlas directamente desde WhatsApp.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NOT NULL | Sucursal |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NULL | Cliente (NULL si aún no existe en el CRM) |
| `service_type_id` | `VARCHAR(30)` | FK → service_types.id, NULL | Tipo de servicio |
| `professional_id` | `VARCHAR(30)` | FK → users.id, NULL | Profesional asignado |
| `client_name` | `VARCHAR(255)` | NOT NULL | Nombre del cliente (desnormalizado para rapidez) |
| `client_phone` | `VARCHAR(20)` | NULL | Teléfono del cliente |
| `start_at` | `TIMESTAMPTZ` | NOT NULL | Inicio de la cita |
| `end_at` | `TIMESTAMPTZ` | NOT NULL | Fin de la cita |
| `status` | `VARCHAR(30)` | NOT NULL, DEFAULT 'scheduled' | scheduled, confirmed, completed, cancelled, no_show |
| `notes` | `TEXT` | NULL | Notas de la cita |
| `channel` | `VARCHAR(50)` | NOT NULL, DEFAULT 'manual' | whatsapp, email, manual |
| `reminder_sent` | `BOOLEAN` | NOT NULL, DEFAULT false | Si se envió recordatorio |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, branch_id, start_at)`, `(tenant_id, start_at)`, `(tenant_id, status)`, `(professional_id, start_at)`

> **Nota de rendimiento (HU-093):** `agendaKpis` agrupa citas por `{ tenantId, startAt }` sin filtrar por `branchId`. El índice compuesto de tres columnas no cubre este patrón (branchId queda en el medio), por lo que se agregó `(tenant_id, start_at)` para esas queries de rango mensual. Migración: `20260422000000_perf_indexes`.

---

### MÓDULO VERA — Finanzas

---

#### `transactions`

Registro financiero de todos los movimientos de dinero. Generado automáticamente por ARI (ventas) y NIRA (compras). No se ingresa manualmente.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal |
| `type` | `VARCHAR(20)` | NOT NULL | income (ingreso) / expense (egreso) |
| `amount` | `DECIMAL(15,2)` | NOT NULL | Monto (siempre positivo) |
| `currency` | `VARCHAR(3)` | NOT NULL, DEFAULT 'COP' | Moneda |
| `description` | `VARCHAR(500)` | NOT NULL | Descripción del movimiento |
| `category` | `VARCHAR(100)` | NULL | Categoría contable |
| `reference_type` | `VARCHAR(50)` | NOT NULL | quote, purchase_order, manual |
| `reference_id` | `VARCHAR(30)` | NOT NULL | ID del documento origen |
| `date` | `DATE` | NOT NULL | Fecha del movimiento |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo fue registrado |

**Índices:** `(tenant_id, date DESC)`, `(tenant_id, type)`, `(reference_type, reference_id)`  
**Regla de negocio:** ARI genera una `transaction` de tipo `income` cuando una cotización cambia a `accepted`. NIRA genera una de tipo `expense` cuando una OC cambia a `approved`.

---

### MÓDULO DASHBOARD — Series históricas

#### `dashboard_daily_rollups`

Consolidado **diario** de métricas para los gráficos de líneas del Dashboard (HU-127), poblado por
un job programado ([apps/api/src/jobs/dashboard-rollup.ts](./apps/api/src/jobs/dashboard-rollup.ts)).
Una fila por **(tenant, sucursal, día)**: `branch_id` NULL = consolidado del tenant (TENANT_ADMIN);
`branch_id` = sucursal (BRANCH_ADMIN/otros, vía `getBranchFilter`). El job hace **delete+insert** por
(tenant, ventana de 120 días) — por eso no hay UNIQUE, solo índices de lectura. RLS por `tenant_id`.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa (RLS) |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal; NULL = consolidado |
| `date` | `DATE` | NOT NULL | Día de la métrica |
| `purchases_received` | `INTEGER` | NOT NULL, DEFAULT 0 | **Compras realizadas** = OC recibidas |
| `purchases_amount` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Monto comprado (suma OC recibidas) |
| `sales_count` | `INTEGER` | NOT NULL, DEFAULT 0 | **Ventas realizadas** = deals ganados (HU-126) |
| `sales_amount` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Monto vendido (suma de `deal.value` ganados) |
| `purchase_orders_created` | `INTEGER` | NOT NULL, DEFAULT 0 | **Órdenes de compra realizadas** = OC creadas (≠ recibidas) |
| `quotes_created` | `INTEGER` | NOT NULL, DEFAULT 0 | Cotizaciones creadas (sucursal = la del creador) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo se calculó la fila |

**Índices:** `(tenant_id, date)`, `(tenant_id, branch_id, date)`

---

## Enumeraciones globales

```
Role:     SUPER_ADMIN | TENANT_ADMIN | BRANCH_ADMIN | AREA_MANAGER | OPERATIVE
Module:   ARI | NIRA | KIRA | AGENDA | VERA
Channel:  WHATSAPP | GMAIL
```

---

## Convenciones

- Todos los IDs son CUID generados por Prisma (`@default(cuid())`)
- Todas las fechas son `TIMESTAMPTZ` (con zona horaria) — nunca `TIMESTAMP`
- Los campos de dinero son `DECIMAL(15,2)` — nunca `FLOAT`
- Los arrays de strings usan el tipo nativo de PostgreSQL `VARCHAR[]`
- Los campos JSON usan `JSONB` (indexable) — nunca `JSON`
- Nombres de tablas en `snake_case` plural
- Nombres de columnas en `snake_case`

---

## Row-Level Security (RLS)

Para activar RLS en todas las tablas de negocio, ejecutar después de cada migración:

```sql
-- Ejemplo para la tabla clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON clients
  USING (tenant_id = current_setting('app.current_tenant_id'));
```

El `tenant_id` se inyecta en cada conexión desde el middleware de Fastify antes de ejecutar cualquier query.
