import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { enviarLinkRedefinicao } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha inválidos. Tente novamente.')
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  const handleEsqueciSenha = async () => {
    setError('')
    setInfo('')
    if (!email.trim()) {
      setError('Digite seu e-mail acima para receber o link de redefinição.')
      return
    }
    const erro = await enviarLinkRedefinicao(email)
    if (erro) { setError(erro); return }
    // Mensagem genérica de propósito: não revela se o e-mail está cadastrado.
    setInfo('Se este e-mail estiver cadastrado, você receberá um link para definir uma nova senha.')
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] fade-in">
        {/* Card */}
        <div className="bg-card rounded-card border border-border shadow-card p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mb-4">
              <Stethoscope size={26} className="text-accent" />
            </div>
            <h1 className="text-xl font-bold text-text-primary">Bem-vinda de volta</h1>
            <p className="text-sm text-text-secondary mt-1">Entre com suas credenciais para continuar</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-sm text-text-primary
                           placeholder:text-text-secondary outline-none transition-all
                           focus:border-accent focus:ring-2 focus:ring-accent/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-border bg-card text-sm text-text-primary
                             placeholder:text-text-secondary outline-none transition-all
                             focus:border-accent focus:ring-2 focus:ring-accent/10"
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

            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={handleEsqueciSenha}
                className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
              >
                Esqueci minha senha
              </button>
            </div>

            {error && (
              <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {info && (
              <p className="text-xs text-text-secondary bg-accent-light border border-accent/20 rounded-lg px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold
                         transition-all hover:bg-accent-dark active:scale-[0.98] disabled:opacity-60
                         disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Entrando...</>
                : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-secondary mt-6">
          Sistema de gestão para clínicas
        </p>
      </div>
    </div>
  )
}
