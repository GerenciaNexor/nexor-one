interface ComingSoonProps {
  module: string
  description: string
}

export function ComingSoon({ module, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center p-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
        <span className="text-2xl font-black text-blue-600">{module[0]}</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900">Modulo {module}</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
        Proximo sprint
      </span>
    </div>
  )
}
