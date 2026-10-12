import Link from 'next/link'

type AppId = 'fryser' | 'bod'

const APPS: { id: AppId; href: string; label: string; icon: string; activeClass: string }[] = [
  { id: 'fryser', href: '/', label: 'Fryser', icon: '🧊', activeClass: 'bg-teal-600 text-white' },
  { id: 'bod', href: '/bod', label: 'Bod', icon: '📦', activeClass: 'bg-amber-400 text-stone-900' },
]

export default function AppSwitcher({ active, dark = false }: { active: AppId; dark?: boolean }) {
  return (
    <nav className={`inline-flex rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
      {APPS.map(app => (
        <Link
          key={app.id}
          href={app.href}
          aria-current={app.id === active ? 'page' : undefined}
          className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            app.id === active
              ? app.activeClass
              : dark ? 'text-stone-300 hover:text-white' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {app.icon} {app.label}
        </Link>
      ))}
    </nav>
  )
}
