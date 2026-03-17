import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(6, { message: 'La contrasena debe tener al menos 6 caracteres' }),
})

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, { message: 'refreshToken es requerido' }),
})

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, { message: 'refreshToken es requerido' }),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RefreshInput = z.infer<typeof RefreshSchema>
export type LogoutInput = z.infer<typeof LogoutSchema>
