-- HU-208 — Teléfono/WhatsApp del usuario interno, para recibir recordatorios por WhatsApp.

ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(30);
