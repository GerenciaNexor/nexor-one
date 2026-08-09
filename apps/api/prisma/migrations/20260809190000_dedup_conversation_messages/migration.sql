-- HU-181 — Un mensaje entrante = una sola respuesta.
-- Dedup atómico por id de mensaje (wamid de WhatsApp / messageId de Gmail).
--
-- 1) Limpiar duplicados históricos: conserva la fila más antigua por (tenant, external_message_id)
--    y elimina el resto. Solo afecta filas con external_message_id NO NULO (mensajes entrantes);
--    los mensajes outbound (external_message_id NULL) no se tocan.
DELETE FROM "conversation_messages" a
USING "conversation_messages" b
WHERE a."external_message_id" IS NOT NULL
  AND a."tenant_id" = b."tenant_id"
  AND a."external_message_id" = b."external_message_id"
  AND a."id" > b."id";

-- 2) Índice UNIQUE (tenant_id, external_message_id). En Postgres los NULL son distintos entre sí,
--    así que múltiples mensajes outbound (external_message_id NULL) siguen permitidos; solo se
--    impide insertar dos veces el mismo mensaje entrante. Nombre = el que genera @@unique en Prisma.
CREATE UNIQUE INDEX "conversation_messages_tenant_id_external_message_id_key"
  ON "conversation_messages" ("tenant_id", "external_message_id");
