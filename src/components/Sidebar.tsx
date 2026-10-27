import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/crm', label: 'CRM', icon: KanbanSquare },
  { to: '/leads', label: 'Leads / Clientes', icon: Users },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const navigate = useNavigate()
  const { profile, clinic } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = profile?.nome
    ? profile.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <aside
      className="sidebar-transition flex flex-col bg-card border-r border-border flex-shrink-0 h-full relative"
      style={{ width: collapsed ? 64 : 220 }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center shadow-card hover:shadow-card-hover transition-shadow"
      >
        {collapsed
          ? <ChevronRight size={12} className="text-text-secondary" />
          : <ChevronLeft size={12} className="text-text-secondary" />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-16 border-b border-border overflow-hidden">
        {clinic?.logo_url ? (
          <img src={clinic.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
            <Stethoscope size={16} className="text-accent" />
          </div>
        )}
        {!collapsed && (
          <span className="font-semibold text-sm text-text-primary truncate">
            {clinic?.nome_clinica || 'Clínica'}
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 p-3 flex-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 overflow-hidden whitespace-nowrap
              ${isActive
                ? 'bg-accent-light text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  className={`flex-shrink-0 ${isActive ? 'text-accent' : 'text-text-secondary'}`}
                />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer / User */}
      <div ref={menuRef} className="relative border-t border-border p-3">
        {menuOpen && (
          <div className="absolute bottom-full left-3 mb-2 w-52 bg-card border border-border rounded-xl shadow-card-hover overflow-hidden fade-in z-20">
            <button
              onClick={() => toggleTheme()}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              {theme === 'dark' ? <Sun size={15} className="flex-shrink-0" /> : <Moon size={15} className="flex-shrink-0" />}
              {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            </button>
            <button
              onClick={() => { setMenuOpen(false); handleLogout() }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-status-danger hover:bg-status-danger-light transition-colors border-t border-border"
            >
              <LogOut size={15} className="flex-shrink-0" />
              Sair
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen(o => !o)}
          title="Configurações da conta"
          className="flex items-center gap-2.5 w-full rounded-xl p-2 hover:bg-surface-hover transition-colors overflow-hidden"
        >
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
              : initials}
          </div>
          {!collapsed && (
            <div className="text-left overflow-hidden">
              <p className="text-xs font-semibold text-text-primary truncate">
                {profile?.nome || 'Usuário'}
              </p>
              <p className="text-[10px] text-text-secondary">Secretária</p>
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}
