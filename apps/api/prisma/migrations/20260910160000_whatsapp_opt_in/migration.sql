-- HU-209 — Consentimiento (opt-in) para notificaciones por WhatsApp.
-- Por defecto activo (mensajes de utilidad sobre la propia operación); se respeta al desactivarlo.
ALTER TABLE "users"   ADD COLUMN "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "clients" ADD COLUMN "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT true;
