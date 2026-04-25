# README_INTEGRATIONS — Integraciones Externas NEXOR V1

> WhatsApp Business API y Gmail son los dos canales por los que los clientes finales se comunican con las empresas que usan NEXOR. Este documento explica cómo funcionan técnicamente, cómo se identifican los tenants, y cómo fluye un mensaje de entrada a salida.

---

## Principio de diseño

NEXOR tiene **un solo webhook para todos los tenants** — no uno por cliente. Esto es fundamental para operar a escala.

Cuando Meta o Google envían un mensaje, lo envían siempre al mismo endpoint. NEXOR identifica a qué tenant pertenece ese mensaje usando el identificador del canal (número de teléfono o email) y busca en la tabla `integrations` el tenant correspondiente.

```
Meta → POST /webhook/whatsapp (un solo endpoint)
NEXOR → busca en integrations WHERE identifier = phone_number_id
NEXOR → identifica tenant → procesa el mensaje del tenant correcto
```

---

## WhatsApp Business API (Meta)

### Cómo funciona a alto nivel

WhatsApp Business API de Meta permite recibir y enviar mensajes programáticamente. No es la app de WhatsApp — es una API oficial de Meta para negocios.

Meta envía los mensajes entrantes a una URL de tu servidor (webhook) como requests POST en tiempo real. Tu servidor debe responder en menos de 5 segundos o Meta reintenta.

### Configuración por tenant

Cada sucursal de un tenant puede tener su propio número de WhatsApp Business. La configuración se guarda en la tabla `integrations`:

```
integrations
  tenant_id: "clxtenant1"
  branch_id: "clxbranch1"        ← Sucursal Norte
  channel: "WHATSAPP"
  identifier: "+573001234567"     ← Número de WA de esa sucursal
  metadata: {
    "phone_number_id": "1039107...",   ← ID interno de Meta
    "business_account_id": "9092..."   ← ID de la cuenta de negocio
  }
  token_encrypted: "AES256..."    ← Access token cifrado con AES-256
  is_active: true
```

### Flujo de verificación del webhook (una sola vez al configurar)

Cuando configuras el webhook en el dashboard de Meta, Meta hace una petición GET al endpoint para verificar que realmente eres tú:

```
Meta → GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=12345
Fastify → verifica que hub.verify_token === WA_VERIFY_TOKEN (variable de entorno)
Fastify → responde con hub.challenge (el número exacto que Meta envió)
Meta → confirma el webhook como válido
```

El `WA_VERIFY_TOKEN` es una cadena que **tú inventas** y guardas en tus variables de entorno. Meta lo almacena y lo envía en cada verificación.

### Flujo de mensaje entrante (en producción)

```
Cliente escribe en WhatsApp: "Quiero comprar 20 shampoo"
    ↓
Meta envía POST /webhook/whatsapp con payload:
{
  "entry": [{
    "changes": [{
      "value": {
        "metadata": {
          "phone_number_id": "1039107959286151"  ← El número de la sucursal
        },
        "messages": [{
          "from": "573009876543",       ← Número del cliente
          "text": { "body": "Quiero comprar 20 shampoo" }
        }]
      }
    }]
  }]
}
    ↓
Fastify verifica firma HMAC-SHA256 del request:
  const signature = request.headers['x-hub-signature-256']
  const expected = 'sha256=' + hmac(APP_SECRET, request.body)
  if (signature !== expected) → rechazar con 403
    ↓
Fastify responde 200 OK inmediatamente (< 1 segundo)
    ↓
Fastify encola en BullMQ: { phone_number_id, from, message }
    ↓
Worker BullMQ procesa:
  1. Busca en integrations WHERE identifier = phone_number_id → obtiene tenantId
  2. Descifra el access_token del tenant
  3. Llama al AgentRunner con el mensaje
  4. AgentRunner devuelve respuesta
  5. Envía respuesta al cliente vía Meta API:
     POST https://graph.facebook.com/v22.0/{phone_number_id}/messages
     Headers: { Authorization: "Bearer {access_token}" }
     Body: { messaging_product: "whatsapp", to: from, type: "text", text: { body: respuesta } }
```

### Variables de entorno necesarias

```env
WA_VERIFY_TOKEN=una-cadena-que-tu-inventas-para-verificar-webhook
APP_SECRET=el-app-secret-de-tu-app-en-meta-for-developers
```

Los `phone_number_id`, `business_account_id` y `access_token` se guardan **por tenant** en la tabla `integrations` (cifrados), no en variables de entorno.

### Tipos de mensajes que procesa NEXOR en V1

| Tipo | Procesado | Notas |
|------|-----------|-------|
| Texto simple | ✅ | El más común — "quiero comprar X", "agendar cita" |
| Respuesta a botones | ✅ | Para flujos guiados (V2) |
| Imagen | ⚠️ V2 | En V2 procesará fotos de facturas con visión computacional |
| Audio | ❌ | No en V1 |
| Documentos | ❌ | No en V1 |

### Límites importantes de Meta

- **Ventana de atención:** Si el cliente no ha escrito en las últimas 24h, no puedes enviarle mensajes de texto libre — solo templates pre-aprobados. Esto es política de Meta.
- **Tasa de mensajes:** 1000 mensajes por segundo por número de teléfono (más que suficiente para V1)
- **Números de prueba:** En el sandbox de desarrollo, solo puedes enviar mensajes a los 5 números que registres manualmente en el panel de Meta

---

## Gmail

### Cómo funciona a alto nivel

Google no envía emails directamente a un webhook. Usa un sistema de Pub/Sub:

1. Gmail observa la bandeja de entrada configurada
2. Cuando llega un email nuevo, Google publica una notificación en un topic de Google Pub/Sub
3. Google Pub/Sub entrega esa notificación al webhook de NEXOR como POST

Para que esto funcione, cada tenant debe autorizar a NEXOR a leer su Gmail mediante **OAuth2**.

### Flujo de autorización OAuth2 (una vez por tenant)

```
Tenant Admin hace clic en "Conectar Gmail"
    ↓
Frontend llama: GET /v1/integrations/gmail/oauth
    ↓
Backend genera URL de autorización de Google:
  https://accounts.google.com/o/oauth2/auth
    ?client_id={GMAIL_CLIENT_ID}
    &redirect_uri=https://api.nexor.app/v1/integrations/gmail/callback
    &scope=https://www.googleapis.com/auth/gmail.readonly
    &response_type=code
    &state={tenantId}  ← para saber a qué tenant pertenece el callback
    ↓
Usuario es redirigido a Google y autoriza el acceso
    ↓
Google redirige a: GET /v1/integrations/gmail/callback?code=xxx&state=tenantId
    ↓
Backend intercambia el código por access_token + refresh_token
    ↓
Backend cifra el refresh_token con AES-256 y lo guarda en integrations
    ↓
Backend configura el watch de Gmail:
  POST https://gmail.googleapis.com/gmail/v1/users/me/watch
  Body: { topicName: "projects/nexor/topics/gmail-messages", labelIds: ["INBOX"] }
```

### Autenticación del webhook Gmail (GMAIL_WEBHOOK_SECRET)

Google Pub/Sub no firma las notificaciones con HMAC como hace Meta. Para verificar que la notificación viene de Google y no de un tercero, NEXOR usa un token secreto en la URL:

```
URL configurada en Pub/Sub:
  https://api.nexor.co/webhook/gmail?token=<GMAIL_WEBHOOK_SECRET>
```

Al recibir cada notificación, el webhook verifica el token usando `crypto.timingSafeEqual(SHA-256(secret), SHA-256(token))` antes de procesar nada. Si el token no coincide o no existe, responde `401 INVALID_SIGNATURE`.

**Importante:** Si `GMAIL_WEBHOOK_SECRET` no está configurado en la variable de entorno, **el webhook rechazará todas las notificaciones con 401**. Google Pub/Sub reintentará indefinidamente. Ver Fase 2 del `docs/LAUNCH_CHECKLIST.md`.

---

### Flujo de email entrante

```
Email llega a la bandeja del tenant
    ↓
Google Pub/Sub envía POST /webhook/gmail?token=<GMAIL_WEBHOOK_SECRET>:
{
  "message": {
    "data": "base64({"emailAddress": "ventas@empresa.com", "historyId": "12345"})",
    "messageId": "xxx"
  }
}
    ↓
Fastify verifica GMAIL_WEBHOOK_SECRET (SHA-256 + timingSafeEqual)
    ↓
Fastify responde 200 OK inmediatamente
    ↓
Fastify encola en BullMQ
    ↓
Worker BullMQ procesa:
  1. Decodifica base64 para obtener emailAddress e historyId
  2. Busca en integrations WHERE identifier = emailAddress → obtiene tenantId + refresh_token cifrado
  3. Descifra el refresh_token
  4. Obtiene un access_token fresco de Google usando el refresh_token
  5. Llama a Gmail API para obtener el email completo:
     GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}
  6. Extrae asunto, remitente y cuerpo del email
  7. Llama al AgentRunner con el contenido del email
  8. AgentRunner genera respuesta y crea notificación interna
  9. (V2) Responder automáticamente al cliente por email
```

### Variables de entorno necesarias

```env
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_PUBSUB_TOPIC=projects/nexor-project/topics/gmail-messages
GMAIL_WEBHOOK_SECRET=cadena-aleatoria-de-al-menos-32-caracteres   # ← NUEVO — requerido desde HU-097
```

El `refresh_token` se guarda **por tenant** en `integrations` (cifrado), nunca en variables de entorno.

`GMAIL_WEBHOOK_SECRET` es una cadena que tú generas (p.ej. `openssl rand -hex 32`) y que debes incluir en la URL de push de la suscripción de Pub/Sub.

---

## Cifrado de tokens

Los tokens de acceso de WhatsApp y Gmail de los clientes son datos extremadamente sensibles. Cualquiera con ese token puede enviar mensajes en nombre del cliente.

**Algoritmo:** AES-256-CBC  
**Clave de cifrado:** Variable de entorno `ENCRYPTION_KEY` (32 caracteres exactos)

```typescript
// Cifrar antes de guardar en DB
function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

// Descifrar para usar
function decryptToken(encrypted: string): string {
  const [ivHex, dataHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString()
}
```

**Reglas:**
- `token_encrypted` nunca aparece en ninguna response de la API
- Solo los workers de BullMQ descifran el token cuando necesitan hacer una llamada externa
- Si un dev necesita testear una integración, usa el sandbox de Meta (números de prueba), nunca el token real de un cliente

---

## Panel de integraciones (Frontend)

El tenant ve una tarjeta por canal con:

```
┌─────────────────────────────────────────┐
│  WhatsApp Business                      │
│  Sucursal Norte: +57 300 123 4567       │
│  Estado: ● Conectado                    │
│  Última verificación: hace 2 horas      │
│                                         │
│  [Probar conexión]  [Desconectar]       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Gmail                                  │
│  ventas@empresa.com                     │
│  Estado: ○ No conectado                 │
│                                         │
│  [Conectar con Google]                  │
└─────────────────────────────────────────┘
```

---

## Manejo de errores de integración

| Error | Causa | Solución |
|-------|-------|---------|
| Token de WhatsApp expirado | Los tokens de sandbox expiran en 24h | El tenant debe regenerarlo en Meta y reconectarlo |
| Token de Gmail expirado | El refresh token fue revocado por el usuario | El tenant debe re-autorizar OAuth2 |
| Meta no entrega mensajes | URL del webhook incorrecta o servidor caído | Verificar que el servidor esté corriendo y la URL sea correcta |
| `phone_number_id` no encontrado | El número no está registrado en integrations | El tenant debe configurar la integración desde el panel |
| Límite de mensajes de Meta | Se superó la cuota por número | Contactar a Meta para aumentar el límite |

Todos los errores de integración generan una notificación in-app al TENANT_ADMIN con instrucciones claras.
