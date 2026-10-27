import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { etapasPadrao, isNicho, type Etapa, type Nicho } from '../lib/funil'

export interface UsuarioProfile {
  id: string
  nome: string
  avatar_url: string | null
  clinica_id: string | null
  is_super_admin: boolean
}

export interface ClinicConfig {
  id: string
  nome_clinica: string | null
  logo_url: string | null
  numero_whatsapp: string | null
  nicho: Nicho
}

interface AuthContextValue {
  userId: string | null
  profile: UsuarioProfile | null
  clinic: ClinicConfig | null
  clinicaId: string | null
  /** Etapas do funil da clínica, em ordem. Fallback: gabarito do nicho enquanto não houver linhas. */
  etapas: Etapa[]
  loading: boolean
  refreshProfile: () => Promise<void>
  refreshClinic: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UsuarioProfile | null>(null)
  const [clinic, setClinic] = useState<ClinicConfig | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>(() => etapasPadrao('estetica'))
  const [loading, setLoading] = useState(true)
  const clinicaIdRef = useRef<string | null>(null)

  const loadClinicById = useCallback(async (clinicaId: string | null) => {
    if (!clinicaId) { setClinic(null); setEtapas(etapasPadrao('estetica')); return }
    const { data } = await supabase
      .from('configuracoes_clinica')
      .select('id, nome_clinica, logo_url, numero_whatsapp, nicho')
      .eq('id', clinicaId)
      .maybeSingle()
    const c = (data as Omit<ClinicConfig, 'nicho'> & { nicho: string } | null)
    const nicho: Nicho = c && isNicho(c.nicho) ? c.nicho : 'estetica'
    setClinic(c ? { ...c, nicho } : null)

    const { data: linhas } = await supabase
      .from('funil_etapas')
      .select('chave, rotulo, ordem, exige_consulta_realizada, e_paciente, mapeia_para')
      .eq('clinica_id', clinicaId)
      .order('ordem', { ascending: true })
    // Se a migration 013 ainda não foi aplicada, a query falha e cai no gabarito.
    setEtapas(linhas && linhas.length > 0 ? (linhas as Etapa[]) : etapasPadrao(nicho))
  }, [])

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUserId(null); setProfile(null); setClinic(null)
      return
    }
    setUserId(user.id)

    let { data: usr } = await supabase
      .from('usuarios')
      .select('id, nome, avatar_url, clinica_id, is_super_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (!usr) {
      // Convite pendente? Consome e já nasce vinculado à clínica que convidou.
      // Ordem importa: o insert valida o convite (trigger usuarios_guard_insert),
      // então o convite só é apagado depois que o usuário foi criado.
      let clinicaIdDoConvite: string | null = null
      let conviteId: string | null = null
      if (user.email) {
        const { data: convite } = await supabase
          .from('convites_clinica')
          .select('id, clinica_id')
          .ilike('email', user.email)
          .maybeSingle()
        if (convite) {
          clinicaIdDoConvite = convite.clinica_id
          conviteId = convite.id
        }
      }

      await supabase.from('usuarios').insert({ id: user.id, nome: '', avatar_url: null, clinica_id: clinicaIdDoConvite })
      if (conviteId) {
        await supabase.from('convites_clinica').delete().eq('id', conviteId)
      }
      const { data: created } = await supabase
        .from('usuarios')
        .select('id, nome, avatar_url, clinica_id, is_super_admin')
        .eq('id', user.id)
        .maybeSingle()
      usr = created
    }

    const p = (usr as UsuarioProfile) ?? null
    setProfile(p)
    clinicaIdRef.current = p?.clinica_id ?? null
    await loadClinicById(p?.clinica_id ?? null)
  }, [loadClinicById])

  const refreshProfile = useCallback(async () => { await loadProfile() }, [loadProfile])
  const refreshClinic = useCallback(async () => { await loadClinicById(clinicaIdRef.current) }, [loadClinicById])

  useEffect(() => {
    (async () => {
      await loadProfile()
      setLoading(false)
    })()

    window.addEventListener('clinic-logo-updated', refreshClinic)
    window.addEventListener('user-profile-updated', refreshProfile)
    return () => {
      window.removeEventListener('clinic-logo-updated', refreshClinic)
      window.removeEventListener('user-profile-updated', refreshProfile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{
      userId,
      profile,
      clinic,
      clinicaId: profile?.clinica_id ?? null,
      etapas,
      loading,
      refreshProfile,
      refreshClinic,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
