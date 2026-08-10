-- HU-187 — Agente interno unificado del dashboard (un solo asistente, módulos como herramientas
-- según el rol del usuario). Se añade el valor 'INTERNO' al enum ModuleName. Additivo y seguro:
-- no reescribe filas ni cambia RLS. Aislado en su propia migración (ALTER TYPE ... ADD VALUE).
ALTER TYPE "ModuleName" ADD VALUE IF NOT EXISTS 'INTERNO';
