-- HU-069: Agrega clientEmail y createdByAgent a appointments
ALTER TABLE "appointments"
  ADD COLUMN "client_email"    VARCHAR(255),
  ADD COLUMN "created_by_agent" BOOLEAN NOT NULL DEFAULT false;
