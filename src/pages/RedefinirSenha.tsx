import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MIN_SENHA } from '../lib/auth'

// Destino dos links de convite (signInWithOtp) e de recuperação de senha.
// Ao abrir o link, o supabase-js lê o token da URL (fluxo implícito) e cria a
// sessão; aqui a pessoa define a senha. Sem token e sem sessão, o link está
// expirado ou já foi usado — não há o que esperar.
type Estado = 'verificando' | 'pronto' | 'invalido'

const ESPERA_MAX_MS = 15000

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<Estado>('verificando')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let ativo = true
    const parar = (novo: Estado) => { if (ativo) setEstado(novo) }

    // Link expirado/usado: o Supabase devolve o motivo no próprio hash.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (hash.get('error') || hash.get('error_code')) { parar('invalido'); return }

    // O token da URL está sendo trocado por sessão; a sessão pode já existir
    // (link recém-aberto ou pessoa logada abrindo a página direto).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) parar('pronto')
    })

    const temTokenNaUrl = !!hash.get('access_token')
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) parar('pronto')
      // Sem token na URL, não há sessão a esperar: o link não serve.
      else if (!temTokenNaUrl) parar('invalido')
    })

    const timeout = setTimeout(() => {
      setEstado(prev => (prev === 'verificando' ? 'invalido' : prev))
    }, ESPERA_MAX_MS)

    return () => {
      ativo = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_SENHA) {
      setError(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Não foi possível salvar a senha. Peça um novo link de acesso.')
      setSaving(false)
      return
    }
    navigate('/', { replace: true })
  }

  const inputClass = `w-full px-4 py-3 rounded-xl border border-border bg-card text-sm text-text-primary
                      placeholder:text-text-secondary outline-none transition-all
                      focus:border-accent focus:ring-2 focus:ring-accent/10`

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] fade-in">
        <div className="bg-card rounded-card border border-border shadow-card p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mb-4">
              <Stethoscope size={26} className="text-accent" />
            </div>
            <h1 className="text-xl font-bold text-text-primary">Defina sua senha</h1>
            <p className="text-sm text-text-secondary mt-1 text-center">
              {estado === 'invalido'
                ? 'Este link não é mais válido.'
                : 'Escolha a senha que você vai usar para entrar no sistema.'}
            </p>
          </div>

          {estado === 'verificando' && (
            <div className="flex justify-center py-6">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {estado === 'invalido' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-text-secondary text-center">
                Links de acesso expiram e só podem ser usados uma vez. Se você recebeu um convite,
                peça um novo ao administrador. Se já tem conta, use "Esqueci minha senha" na tela de login.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-all hover:bg-accent-dark active:scale-[0.98]"
              >
                Ir para o login
              </button>
            </div>
          )}

          {estado === 'pronto' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Nova senha</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Mínimo de ${MIN_SENHA} caracteres`}
                    autoComplete="new-password"
                    required
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Confirmar senha</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={inputClass}
                />
              </div>

              {error && (
                <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold
                           transition-all hover:bg-accent-dark active:scale-[0.98] disabled:opacity-60
                           disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : 'Salvar senha e entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
