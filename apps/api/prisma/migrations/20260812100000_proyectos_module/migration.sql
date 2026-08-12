-- HU-198 — nuevo módulo PROYECTOS (metas/objetivos y límites/presupuestos por línea de negocio).
-- Aislada y additiva: solo añade el valor al enum para poder guardar su feature_flag.
ALTER TYPE "ModuleName" ADD VALUE IF NOT EXISTS 'PROYECTOS';
