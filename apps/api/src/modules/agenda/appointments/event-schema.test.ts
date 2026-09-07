/**
 * HU-204 — Reglas del CreateAppointmentSchema para los dos tipos (cita de servicio vs evento libre)
 * y del AttendeeInput. La cita de servicio conserva sus requisitos; el evento libre solo exige título.
 */
import { describe, it, expect } from 'vitest'
import { CreateAppointmentSchema, AttendeeInput, AvailabilityCheckSchema } from './schema'

describe('HU-204 — CreateAppointmentSchema (servicio vs evento)', () => {
  it('servicio: exige sucursal, servicio y cliente', () => {
    const bad = CreateAppointmentSchema.safeParse({ type: 'service', startAt: '2026-09-10T15:00:00.000Z' })
    expect(bad.success).toBe(false)
    const ok = CreateAppointmentSchema.safeParse({ type: 'service', startAt: '2026-09-10T15:00:00.000Z', branchId: 'b1', serviceTypeId: 's1', clientName: 'Ana' })
    expect(ok.success).toBe(true)
  })

  it('servicio por defecto: sin type se asume "service" y aplica sus reglas', () => {
    const r = CreateAppointmentSchema.safeParse({ startAt: '2026-09-10T15:00:00.000Z', branchId: 'b1', serviceTypeId: 's1', clientName: 'Ana' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.type).toBe('service')
  })

  it('evento: solo exige título (sucursal/servicio/cliente NO son obligatorios)', () => {
    const bad = CreateAppointmentSchema.safeParse({ type: 'event', startAt: '2026-09-10T15:00:00.000Z' })
    expect(bad.success).toBe(false) // falta título
    const ok = CreateAppointmentSchema.safeParse({ type: 'event', startAt: '2026-09-10T15:00:00.000Z', title: 'Reunión de equipo' })
    expect(ok.success).toBe(true)
  })

  it('evento: acepta asistentes internos y externos combinados', () => {
    const r = CreateAppointmentSchema.safeParse({
      type: 'event', startAt: '2026-09-10T15:00:00.000Z', endAt: '2026-09-10T16:00:00.000Z', title: 'Grabación',
      attendees: [{ userId: 'u1' }, { email: 'externo@correo.com', name: 'Invitado' }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.attendees).toHaveLength(2)
  })

  it('AttendeeInput: cada asistente requiere userId o email', () => {
    expect(AttendeeInput.safeParse({ name: 'Sin id' }).success).toBe(false)
    expect(AttendeeInput.safeParse({ userId: 'u1' }).success).toBe(true)
    expect(AttendeeInput.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(AttendeeInput.safeParse({ email: 'no-es-correo' }).success).toBe(false)
  })

  it('HU-205 — AvailabilityCheckSchema exige al menos un usuario + rango', () => {
    expect(AvailabilityCheckSchema.safeParse({ userIds: [], from: 'a', to: 'b' }).success).toBe(false)
    const ok = AvailabilityCheckSchema.safeParse({ userIds: ['u1', 'u2'], from: '2026-09-10T15:00:00.000Z', to: '2026-09-10T16:00:00.000Z', excludeId: 'ap1' })
    expect(ok.success).toBe(true)
  })
})
