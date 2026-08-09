-- HU-180 — Agente de atención al cliente dedicado para canales externos (WhatsApp/Gmail).
-- Se añade el valor 'ATENCION' al enum ModuleName. Es una operación ADDITIVA y segura:
-- no reescribe filas existentes ni cambia RLS (no hay tabla nueva). Aislada en su propia
-- migración porque ALTER TYPE ... ADD VALUE no puede usar el valor recién creado en la
-- misma transacción.
ALTER TYPE "ModuleName" ADD VALUE IF NOT EXISTS 'ATENCION';
