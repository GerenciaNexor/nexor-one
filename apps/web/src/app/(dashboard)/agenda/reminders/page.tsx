import { RemindersPanel } from '@/components/reminders/RemindersPanel'

// HU-157 — Gestión de recordatorios desde Agenda (mismo modal/endpoint que Inicio).
export default function AgendaRemindersPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Recordatorios personales para tus pendientes. Puedes crearlos aquí o desde Inicio; al hacer
        clic en uno lo abres para editarlo o marcarlo como hecho.
      </p>
      <RemindersPanel variant="full" />
    </div>
  )
}
