# README_DEVELOPMENT — Guía de Desarrollo Local NEXOR

> **Estado:** Este documento está pendiente de completar.  
> Se llenará completamente una vez que el proyecto esté montado y funcionando localmente al final del Sprint 1.

---

## Por qué está pendiente

Este README documenta comandos reales, pasos de instalación verificados y configuraciones específicas del proyecto. Documentar estos pasos antes de tenerlos probados genera documentación incorrecta que confunde más de lo que ayuda.

Al finalizar el Sprint 1 (día 14), cuando `pnpm dev` levante la API y el web sin errores, este documento se completará con:

---

## Secciones que tendrá este documento

### 1. Prerequisitos
- Versión exacta de Node.js requerida
- Versión exacta de pnpm requerida
- Otras herramientas necesarias

### 2. Instalación desde cero
- Cómo clonar el repositorio
- Cómo instalar dependencias
- Cómo configurar las variables de entorno
- Cómo ejecutar las migraciones de la DB
- Cómo correr el seed de datos de prueba
- Cómo levantar el servidor de desarrollo

### 3. Comandos del día a día
- `pnpm dev` — levantar todo en paralelo
- `pnpm build` — compilar para producción
- `pnpm test` — correr todos los tests
- `pnpm lint` — verificar el código
- Comandos de base de datos
- Comandos de Prisma

### 4. Variables de entorno
- Lista completa de todas las variables requeridas
- Cómo obtener cada una (BD local, API keys de servicios, etc.)
- Variables opcionales y sus valores por defecto

### 5. Estructura de ramas y flujo de PRs
- Cómo crear una rama para un ticket
- Cómo abrir un PR
- Qué debe tener un PR para ser aprobado
- Cómo hacer deploy a staging

### 6. Convenciones de código
- Formato de nombres de archivos, funciones y variables
- Cómo estructurar un módulo nuevo
- Cómo escribir tests
- Qué va en `packages/shared` y qué no

### 7. Debugging y problemas comunes
- Errores frecuentes y cómo resolverlos
- Cómo ver los logs en desarrollo
- Cómo acceder a Prisma Studio
- Cómo inspeccionar las colas de BullMQ

---

## Responsable de completar este documento

Dev 1 y Dev 2 completan este documento al cierre del Sprint 1, como parte del ticket NEX-001.

**Fecha objetivo:** Día 14 del Sprint 1.
