/** Cartão de seção usado nas telas de configuração. */
export function Card({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center"><Icon size={15} className="text-accent" /></div>
        <h2 className="font-bold text-text-primary text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}
