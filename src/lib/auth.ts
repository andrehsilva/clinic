import { supabase } from './supabase'

/** Tamanho mínimo de senha aceito pela tela de definição de senha. */
export const MIN_SENHA = 8

const REDIRECT_SENHA = () => `${window.location.origin}/redefinir-senha`

/** Mensagem de erro do Supabase traduzida; null em caso de sucesso. */
function mensagemSenha(error: { code?: string; message?: string } | null): string {
  if (!error) return ''
  if (error.code === 'same_password' || /different from the old password/i.test(error.message ?? '')) {
    return 'A nova senha precisa ser diferente da senha atual.'
  }
  if (error.code === 'weak_password' || /weak password/i.test(error.message ?? '')) {
    return `A senha é muito fraca. Use pelo menos ${MIN_SENHA} caracteres.`
  }
  return 'Não foi possível salvar a nova senha. Tente novamente.'
}

/**
 * Troca a senha de quem já está logado, sem passar por e-mail.
 * Reautentica com a senha atual antes de gravar a nova: o Supabase aceitaria
 * `updateUser` só com a sessão, e aí uma sessão esquecida aberta bastaria para
 * trocar a senha de outra pessoa.
 */
export async function trocarSenha(senhaAtual: string, novaSenha: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return 'Sessão expirada. Entre novamente para trocar a senha.'

  const { error: reauth } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: senhaAtual,
  })
  if (reauth) return 'Senha atual incorreta.'

  const { error } = await supabase.auth.updateUser({ password: novaSenha })
  return error ? mensagemSenha(error) : null
}

/** Envia o link de "Esqueci minha senha"; null em caso de sucesso. */
export async function enviarLinkRedefinicao(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: REDIRECT_SENHA(),
  })
  return error ? 'Não foi possível enviar o e-mail. Tente novamente em instantes.' : null
}

/**
 * Convida por e-mail: registra (ou re-aponta) o convite da clínica e manda o
 * link de acesso. Ao clicar, a pessoa cai em /redefinir-senha, cria a senha e
 * já entra na clínica do convite (o AuthContext consome a linha de convites).
 * null em caso de sucesso.
 */
export async function convidarUsuario(email: string, clinicaId: string): Promise<string | null> {
  const alvo = email.trim()

  const { data: existing } = await supabase
    .from('convites_clinica')
    .select('id')
    .ilike('email', alvo)
    .maybeSingle()

  const { error: conviteError } = existing
    ? await supabase.from('convites_clinica').update({ clinica_id: clinicaId }).eq('id', existing.id)
    : await supabase.from('convites_clinica').insert({ email: alvo, clinica_id: clinicaId })

  if (conviteError) return 'Não foi possível registrar o convite. Tente novamente.'

  const { error } = await supabase.auth.signInWithOtp({
    email: alvo,
    options: { emailRedirectTo: REDIRECT_SENHA() },
  })
  return error ? `Não foi possível enviar o convite: ${error.message}` : null
}
