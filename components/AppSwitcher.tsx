import Link from 'next/link'

type AppId = 'fryser' | 'bod' | 'rydding'

const APPS: { id: AppId; href: string; label: string; icon: string; activeClass: string }[] = [
  { id: 'fryser', href: '/', label: 'Fryser', icon: '🧊', activeClass: 'bg-teal-600 text-white' },
  { id: 'bod', href: '/bod', label: 'Bod', icon: '📦', activeClass: 'bg-amber-400 text-stone-900' },
  { id: 'rydding', href: '/rydding', label: 'Rydding', icon: '🧹', activeClass: 'bg-violet-600 text-white' },
]

// På smale mobiler vises bare navnet på appen du er i, de andre som ikon
export default function AppSwitcher({ active, dark = false }: { active: AppId; dark?: boolean }) {
  return (
    <nav className={`inline-flex flex-shrink-0 rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
      {APPS.map(app => {
        const isActive = app.id === active
        return (
          <Link
            key={app.id}
            href={app.href}
            aria-current={isActive ? 'page' : undefined}
            aria-label={app.label}
            title={app.label}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? app.activeClass
                : dark ? 'text-stone-300 hover:text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {app.icon}
            <span className={isActive ? 'ml-1' : 'ml-1 hidden min-[440px]:inline'}>{app.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
