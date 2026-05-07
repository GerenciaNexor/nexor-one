-- Amplía el CHECK de message_type para permitir mensajes de sistema.
-- Los mensajes de tipo 'system' los genera el worker cuando el agente hace fallback
-- (hitMaxTurns) — sirven para notificar al equipo humano que la conversación
-- requiere atención.

ALTER TABLE "conversation_messages"
  DROP CONSTRAINT "conversation_messages_type_check";

ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_type_check"
  CHECK (message_type IN ('text', 'image', 'document', 'system'));
