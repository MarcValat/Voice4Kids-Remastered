import type { ReactNode } from 'react'

type SectionProps = {
  title: string
  icon?: string
  children: ReactNode
}

export default function Section({ title, icon, children }: SectionProps) {
  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-orange-950">
        {icon && <span aria-hidden="true">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  )
}
