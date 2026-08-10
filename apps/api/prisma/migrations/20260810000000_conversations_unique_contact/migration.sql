-- HU-186 — Una sola conversación persistente por contacto y canal (sin duplicados).

-- 1) Consolidar duplicados existentes: por cada (tenant, canal, remitente) se conserva la
--    conversación MÁS ANTIGUA y se mueven a ella los mensajes de las demás.
WITH map AS (
  SELECT c.id AS from_id,
         first_value(c.id) OVER (
           PARTITION BY c.tenant_id, c.channel, c.sender_identifier
           ORDER BY c.created_at ASC
         ) AS to_id
  FROM conversations c
)
UPDATE conversation_messages m
SET conversation_id = map.to_id
FROM map
WHERE m.conversation_id = map.from_id AND map.from_id <> map.to_id;

-- 2) Eliminar las conversaciones duplicadas (ya vaciadas de mensajes).
WITH map AS (
  SELECT c.id AS from_id,
         first_value(c.id) OVER (
           PARTITION BY c.tenant_id, c.channel, c.sender_identifier
           ORDER BY c.created_at ASC
         ) AS to_id
  FROM conversations c
)
DELETE FROM conversations WHERE id IN (SELECT from_id FROM map WHERE from_id <> to_id);

-- 3) Alinear last_message_at de la conservada con su mensaje más reciente.
UPDATE conversations c
SET last_message_at = GREATEST(c.last_message_at, sub.maxc)
FROM (SELECT conversation_id, max(created_at) AS maxc FROM conversation_messages GROUP BY conversation_id) sub
WHERE c.id = sub.conversation_id;

-- 4) Reemplazar el índice no único por un UNIQUE (una conversación por contacto/canal).
DROP INDEX IF EXISTS "conversations_tenant_id_channel_sender_identifier_idx";
CREATE UNIQUE INDEX "conversations_tenant_id_channel_sender_identifier_key"
  ON "conversations" ("tenant_id", "channel", "sender_identifier");
