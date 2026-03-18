# README_ONBOARDING_CLIENT — Proceso de Onboarding de Clientes NEXOR V1

> Este documento es para el equipo de operaciones de NEXOR. Describe paso a paso cómo activar a un nuevo cliente en la plataforma, desde que firma el contrato hasta que está usando el sistema el primer día.

---

## Visión general del proceso

```
Cliente firma contrato
    ↓
Equipo NEXOR envía plantilla Excel al cliente
    ↓
Cliente llena el Excel con sus datos
    ↓
Equipo NEXOR valida el Excel
    ↓
Equipo NEXOR ejecuta script de seed en la DB
    ↓
Sistema activa usuarios y envía invitaciones por email
    ↓
Equipo NEXOR conecta integraciones (WhatsApp, Gmail)
    ↓
Sesión de capacitación por roles
    ↓
Cliente empieza a usar NEXOR
    ↓
Monitoreo activo primeras 2 semanas
```

---

## Paso 1 — Enviar plantilla Excel al cliente

El equipo NEXOR envía el archivo `NEXOR_Onboarding_Template.xlsx` al cliente.

Este Excel tiene **6 pestañas**. El cliente debe llenar las marcadas como obligatorias antes de que el equipo pueda activarle el sistema.

---

## Contenido del Excel de onboarding

### Pestaña 1: Empresa (obligatorio)

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| Nombre comercial | Farmacia López | ✅ |
| Nombre legal / Razón social | Farmacia López S.A.S. | ✅ |
| NIT / RUT | 900123456-7 | ✅ |
| Zona horaria | America/Bogota | ✅ |
| Moneda | COP | ✅ |
| Logo URL o archivo | logo.png | ❌ |

### Pestaña 2: Sucursales (obligatorio — al menos 1)

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| Nombre de la sucursal | Sede Norte | ✅ |
| Ciudad | Bogotá | ✅ |
| Dirección | Cra 10 #20-30 | ❌ |
| Teléfono | 601 234 5678 | ❌ |

### Pestaña 3: Usuarios iniciales (obligatorio)

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| Nombre completo | María García | ✅ |
| Email | maria@farmacialopez.com | ✅ |
| Rol | TENANT_ADMIN | ✅ |
| Módulo (si es AREA_MANAGER u OPERATIVE) | KIRA | Condicional |
| Sucursal asignada (nombre exacto de pestaña 2) | Sede Norte | ❌ |

**Roles válidos en el Excel:** TENANT_ADMIN, BRANCH_ADMIN, AREA_MANAGER, OPERATIVE

### Pestaña 4: Catálogo de productos / KIRA (obligatorio si módulo KIRA activo)

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| SKU | SHAM-001 | ✅ |
| Nombre | Shampoo Pantene 400ml | ✅ |
| Categoría | Cuidado personal | ❌ |
| Unidad de medida | unidad | ✅ |
| Precio de venta | 15000 | ❌ |
| Precio de costo | 9000 | ❌ |
| Stock mínimo | 10 | ✅ |
| Stock máximo | 100 | ❌ |

### Pestaña 5: Stock inicial por sucursal (obligatorio si módulo KIRA activo)

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| SKU (debe existir en pestaña 4) | SHAM-001 | ✅ |
| Nombre de sucursal (debe existir en pestaña 2) | Sede Norte | ✅ |
| Cantidad actual | 45 | ✅ |

### Pestaña 6: Proveedores / NIRA (opcional)

| Campo | Ejemplo | Obligatorio |
|-------|---------|-------------|
| Nombre del proveedor | Distribuidora Reyes | ❌ |
| Nombre del contacto | Pedro Reyes | ❌ |
| Email | pedro@reyes.com | ❌ |
| Teléfono | 310 987 6543 | ❌ |
| NIT | 800456789-1 | ❌ |
| Días de crédito | 30 | ❌ |

---

## Paso 2 — Validar el Excel

Antes de ejecutar el seed, el equipo NEXOR valida:

**Validaciones críticas (bloquean el onboarding):**
- [ ] Al menos un usuario con rol TENANT_ADMIN
- [ ] Al menos una sucursal
- [ ] Si KIRA está activo: al menos un producto con stock mínimo definido
- [ ] Emails de usuarios son únicos y tienen formato válido
- [ ] SKUs de productos son únicos dentro del Excel
- [ ] Los SKUs en la pestaña de stock existen en la pestaña de catálogo
- [ ] Los nombres de sucursal en stock coinciden exactamente con la pestaña de sucursales

**Validaciones de advertencia (no bloquean pero hay que informar al cliente):**
- [ ] Productos sin precio de venta (cotizaciones no funcionarán correctamente)
- [ ] Usuarios sin sucursal asignada (verán datos de todas las sucursales)

---

## Paso 3 — Ejecutar el script de seed

Una vez validado el Excel, el equipo ejecuta el script de onboarding:

```bash
# Desde la raíz del proyecto — apuntando a la base de datos de desarrollo
pnpm --filter @nexor/api onboarding --file="ruta/al/archivo.xlsx"

# Con módulos adicionales (ARI, AGENDA, VERA se activan explícitamente;
# KIRA y NIRA se auto-detectan si el Excel tiene productos / proveedores)
pnpm --filter @nexor/api onboarding --file="ruta.xlsx" --modules="ARI,AGENDA,VERA"

# Apuntando directamente a producción (Railway)
DATABASE_URL="postgresql://postgres:<password>@turntable.proxy.rlwy.net:28927/railway" \
  pnpm --filter @nexor/api onboarding --file="ruta/al/archivo.xlsx"
```

El script hace en este orden:
1. Valida el Excel completo — si hay errores, los reporta TODOS y no escribe nada
2. Crea el `Tenant` en la DB
3. Crea las `Branches` (sucursales)
4. Activa los `FeatureFlags` según módulos contratados
5. Crea los `Users` con contraseñas temporales hasheadas con bcrypt (nunca aparecen en consola)
6. Si KIRA activo: importa `Products`
7. Si KIRA activo: crea registros de `Stock` por sucursal
8. Si NIRA activo: importa `Suppliers`
9. Imprime resumen con totales de lo creado

**El script es idempotente:** si se corre dos veces con el mismo Excel, no duplica datos.

---

## Paso 4 — Conectar integraciones

Después del seed, el equipo conecta las integraciones según lo que el cliente entregó:

### WhatsApp Business

Para cada número de WA que el cliente quiera conectar:

1. Verificar que el número de teléfono no está activo en la app de WhatsApp normal
   - Si está activo: el cliente debe desvincularlo primero en la app
2. En el panel de Meta for Developers de NEXOR:
   - Agregar el número en la app de NEXOR
   - Meta envía código de verificación al número (llamada o SMS)
   - Ingresar el código
3. En el panel de NEXOR (como TENANT_ADMIN del cliente):
   - Ir a Configuración → Integraciones → WhatsApp
   - Ingresar el `phone_number_id` y el `access_token` que Meta generó
   - Seleccionar la sucursal correspondiente
   - Hacer clic en "Probar conexión"

### Gmail

Para cada email que el cliente quiera conectar:

1. En el panel de NEXOR (como TENANT_ADMIN del cliente):
   - Ir a Configuración → Integraciones → Gmail
   - Hacer clic en "Conectar con Google"
   - Autorizar el acceso con la cuenta de Gmail del cliente
2. Verificar que la integración está activa

---

## Paso 5 — Sesión de capacitación

Se realizan **dos sesiones separadas** de capacitación:

### Sesión 1: TENANT_ADMIN y BRANCH_ADMIN (1-2 horas)
Temas:
- Cómo crear y gestionar usuarios
- Cómo configurar módulos y sucursales
- Cómo ver reportes consolidados
- Cómo gestionar integraciones
- Cómo interpretar las notificaciones del sistema

### Sesión 2: Por módulo (30-45 min cada una)
Una sesión por cada módulo activo, con los usuarios que van a usarlo:
- **ARI:** cómo gestionar clientes, el pipeline, y las cotizaciones
- **NIRA:** cómo crear OCs, recibir mercancía, y evaluar proveedores
- **KIRA:** cómo registrar movimientos, interpretar alertas, y hacer conteos
- **AGENDA:** cómo configurar disponibilidad y gestionar citas
- **VERA:** cómo leer los reportes financieros

---

## Paso 6 — Monitoreo post-lanzamiento

Durante las primeras 2 semanas, el equipo NEXOR monitorea:

**Técnico (diario):**
- [ ] Errores en Sentry (ningún error crítico)
- [ ] Jobs de BullMQ corriendo sin fallos
- [ ] Webhook de WhatsApp recibiendo mensajes correctamente

**De adopción (semanal):**
- [ ] Usuarios iniciando sesión regularmente
- [ ] Al menos un movimiento de stock registrado (si KIRA activo)
- [ ] Al menos una cotización creada (si ARI activo)

**Canal de feedback:**
Canal directo de WhatsApp con el TENANT_ADMIN para reportar problemas o dudas en tiempo real.

---

## Datos de acceso entregados al cliente

Al finalizar el onboarding, el equipo entrega al cliente:

```
URL del sistema: https://app.nexor.app
Usuario admin:   email@empresa.com
Contraseña:      (definida por el usuario en el email de invitación)

Usuarios creados: [lista con email y rol de cada uno]
Módulos activos: [lista de módulos]
Sucursales configuradas: [lista]
```

---

## Qué hacer si hay un error en el seed

Si el script de seed falla a mitad de ejecución:

1. **No ejecutar el seed de nuevo todavía.** Puede generar datos duplicados parciales.
2. Revisar el log de error del script para identificar en qué paso falló.
3. Si el error es en usuarios o stock (pasos 4-8): es seguro limpiar esos datos y re-ejecutar.
4. Si el error es en el tenant o sucursales (pasos 1-2): hacer rollback completo.
5. Corregir el problema en el Excel o en el script y volver a ejecutar.

El script imprime en consola un log detallado con cada operación ejecutada. Redirígelo a un archivo si necesitas guardarlo:

```bash
DATABASE_URL="..." pnpm --filter @nexor/api onboarding --file="ruta.xlsx" 2>&1 | tee onboarding-$(date +%Y%m%d).log
```
