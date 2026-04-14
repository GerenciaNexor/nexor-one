import { z } from 'zod'

// ─── Cliente ──────────────────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  name:       z.string().min(1, 'El nombre es requerido').max(255),
  email:      z.string().email('Email inválido').optional(),
  phone:      z.string().max(20).optional(),
  whatsappId: z.string().max(50).optional(),
  company:    z.string().max(255).optional(),
  taxId:      z.string().max(50).optional(),
  address:    z.string().max(500).optional(),
  city:       z.string().max(100).optional(),
  source:     z.enum(['whatsapp', 'email', 'manual', 'referido']).optional(),
  tags:       z.array(z.string()).default([]),
  notes:      z.string().optional(),
  assignedTo: z.string().optional(),
  branchId:   z.string().optional(),
})

export const UpdateClientSchema = z.object({
  name:       z.string().min(1).max(255).optional(),
  email:      z.string().email().nullable().optional(),
  phone:      z.string().max(20).nullable().optional(),
  whatsappId: z.string().max(50).nullable().optional(),
  company:    z.string().max(255).nullable().optional(),
  taxId:      z.string().max(50).nullable().optional(),
  address:    z.string().max(500).nullable().optional(),
  city:       z.string().max(100).nullable().optional(),
  source:     z.enum(['whatsapp', 'email', 'manual', 'referido']).nullable().optional(),
  tags:       z.array(z.string()).optional(),
  notes:      z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  branchId:   z.string().nullable().optional(),
})

export const ClientQuerySchema = z.object({
  search:     z.string().optional(),
  source:     z.string().optional(),
  assignedTo: z.string().optional(),
})

// ─── Interacciones ────────────────────────────────────────────────────────────

export const CreateInteractionSchema = z.object({
  type:      z.enum(['whatsapp', 'email', 'call', 'note', 'meeting']),
  direction: z.enum(['inbound', 'outbound']),
  content:   z.string().min(1, 'El contenido es requerido'),
  dealId:    z.string().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateClientInput      = z.infer<typeof CreateClientSchema>
export type UpdateClientInput      = z.infer<typeof UpdateClientSchema>
export type ClientQuery            = z.infer<typeof ClientQuerySchema>
export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>
