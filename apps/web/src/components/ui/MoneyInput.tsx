'use client'

/**
 * Campo de dinero con separador de miles (formato es-CO): al escribir 50000 se muestra «50.000».
 * `<input type="number">` no admite separadores, así que es un input de texto que:
 *   · muestra el valor agrupado con puntos y un prefijo «$»,
 *   · devuelve por onChange SOLO los dígitos crudos (p. ej. "50000"), listos para Number().
 * Pensado para montos en COP (enteros; sin decimales, igual que se muestran en la app).
 */

/** "50000" → "50.000" (agrupa de a 3 desde la derecha, sin ceros a la izquierda). */
export function groupThousands(digits: string): string {
  const clean = String(digits).replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!clean) return ''
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface MoneyInputProps {
  value:            string | number      // dígitos crudos ("50000") o número
  onChange:         (rawDigits: string) => void
  placeholder?:     string
  className?:       string               // clases del <input>
  wrapperClassName?: string              // clases del contenedor (p. ej. "flex-1 min-w-0" en una fila flex)
  id?:              string
  disabled?:        boolean
}

export function MoneyInput({ value, onChange, placeholder, className = '', wrapperClassName = '', id, disabled }: MoneyInputProps) {
  const raw = String(value ?? '').replace(/\D/g, '')
  return (
    <div className={`relative ${wrapperClassName}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={groupThousands(raw)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        className={`pl-7 ${className}`}
      />
    </div>
  )
}
