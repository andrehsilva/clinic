import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

interface UserProfile {
  nome: string
  avatar_url: string | null
}

interface ClinicConfig {
  logo_url: string | null
  nome_clinica: string | null
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/crm', label: 'CRM', icon: KanbanSquare },
  { to: '/leads', label: 'Leads / Clientes', icon: Users },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [clinic, setClinic] = useState<ClinicConfig | null>(null)

  const loadClinic = async () => {
    const { data: cfg } = await supabase
      .from('configuracoes_clinica')
      .select('logo_url, nome_clinica')
      .limit(1)
      .maybeSingle()
    if (cfg) setClinic(cfg)
  }

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: usr } = await supabase
      .from('usuarios')
      .select('nome, avatar_url')
      .eq('id', user.id)
      .single()
    if (usr) setProfile(usr)
  }

  useEffect(() => {
    loadProfile()
    loadClinic()
    window.addEventListener('clinic-logo-updated', loadClinic)
    window.addEventListener('user-profile-updated', loadProfile)
    return () => {
      window.removeEventListener('clinic-logo-updated', loadClinic)
      window.removeEventListener('user-profile-updated', loadProfile)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = profile?.nome
    ? profile.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <aside
      className="sidebar-transition flex flex-col bg-white border-r border-border flex-shrink-0 h-full relative"
      style={{ width: collapsed ? 64 : 220 }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center shadow-card hover:shadow-card-hover transition-shadow"
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
                : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
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
      <div className="border-t border-border p-3">
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex items-center gap-2.5 w-full rounded-xl p-2 hover:bg-gray-50 transition-colors overflow-hidden"
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
