import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Plus, Pencil, Trash2, X, Save, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Toast } from './Toast'
import { Card } from './Card'
import { nowSP } from '../lib/dateRange'
import { renderizarMensagem } from '../lib/aniversario'
import {
  descreverData, diaValidoNoMes, nomeDoMes, proximaExecucao,
  type CampanhaMensagem,
} from '../lib/mensagensProgramadas'

const MENSAGEM_MAX = 1000
const NOME_MAX = 60
const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card'
const MESES = Array.from({ length: 12 }, (_, i) => i + 1)

function hojeSP() {
  const h = nowSP()
  return { y: h.getFullYear(), m: h.getMonth() + 1, d: h.getDate() }
}

/** Data legível a partir de 'YYYY-MM-DD'. */
function fmtData(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Formulário ───────────────────────────────────────────────────────────────
function CampanhaModal({ campanha, clinicaId, onClose, onSaved }: {
  campanha?: CampanhaMensagem
  clinicaId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { clinic, profile } = useAuth()
  const isEdit = !!campanha
  const [nome, setNome] = useState(campanha?.nome ?? '')
  const [mensagem, setMensagem] = useState(campanha?.mensagem ?? '')
  const [dia, setDia] = useState(String(campanha?.dia ?? 25))
  const [mes, setMes] = useState(String(campanha?.mes ?? 12))
  const [todoAno, setTodoAno] = useState(campanha ? campanha.ano === null : true)
  const [ano, setAno] = useState(String(campanha?.ano ?? hojeSP().y))
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const preview = renderizarMensagem(mensagem, {
    nome: profile?.nome ?? null,
    clinica: clinic?.nome_clinica ?? null,
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const d = Number(dia)
    const m = Number(mes)
    const a = todoAno ? null : Number(ano)

    if (!nome.trim()) { setErro('Dê um nome para a mensagem (ex.: Natal).'); return }
    if (!mensagem.trim()) { setErro('Escreva o texto da mensagem.'); return }
    if (!diaValidoNoMes(m, d)) { setErro(`O dia ${d} não existe em ${nomeDoMes(m)}.`); return }
    if (!todoAno && (a === null || !Number.isInteger(a) || a < 2000 || a > 2100)) { setErro('Informe um ano válido.'); return }

    setSaving(true)
    const payload = {
      clinica_id: clinicaId,
      nome: nome.trim(),
      mensagem: mensagem.trim(),
      dia: d,
      mes: m,
      ano: a,
    }
    const { error } = isEdit
      ? await supabase.from('mensagens_programadas').update(payload).eq('id', campanha!.id).eq('clinica_id', clinicaId)
      : await supabase.from('mensagens_programadas').insert(payload)
    setSaving(false)

    if (error) {
      setErro(error.code === '23505'
        ? 'Já existe uma mensagem com esse nome nesta clínica.'
        : 'Não foi possível salvar. Tente novamente.')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar mensagem programada' : 'Nova mensagem programada'}
        className="bg-card rounded-[14px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-bold text-text-primary">{isEdit ? 'Editar mensagem' : 'Nova mensagem programada'}</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Fechar"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Nome</label>
            <input required maxLength={NOME_MAX} value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Natal" className={inputCls} />
            <p className="text-[11px] text-text-secondary mt-1">Só para você identificar a mensagem na lista.</p>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Dia</label>
              <input required type="number" min={1} max={31} value={dia} onChange={e => setDia(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Mês</label>
              <select value={mes} onChange={e => setMes(e.target.value)} className={inputCls}>
                {MESES.map(m => <option key={m} value={m}>{nomeDoMes(m)}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={todoAno} onChange={e => setTodoAno(e.target.checked)} />
            Repetir todo ano
          </label>
          {!todoAno && (
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Ano</label>
              <input required type="number" min={2000} max={2100} value={ano} onChange={e => setAno(e.target.value)} className={`${inputCls} w-32`} />
              <p className="text-[11px] text-text-secondary mt-1">Envia só nesse ano — bom para promoção pontual.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Texto da mensagem</label>
            <textarea required rows={4} maxLength={MENSAGEM_MAX} value={mensagem}
              onChange={e => setMensagem(e.target.value)} className={`${inputCls} resize-y`}
              placeholder="Feliz Natal, {nome}! A equipe da {clinica} deseja boas festas." />
            <div className="flex justify-between text-[11px] text-text-secondary mt-1">
              <span>Use <code>{'{nome}'}</code> para o primeiro nome e <code>{'{clinica}'}</code> para o nome da clínica.</span>
              <span>{mensagem.length}/{MENSAGEM_MAX}</span>
            </div>
          </div>

          <div className="bg-page border border-border rounded-xl p-3">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Prévia com os dados desta clínica</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{preview || '—'}</p>
          </div>

          {erro && <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2">{erro}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Seção ────────────────────────────────────────────────────────────────────
export function MensagensProgramadas() {
  const { clinicaId } = useAuth()
  const [campanhas, setCampanhas] = useState<CampanhaMensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<CampanhaMensagem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!clinicaId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('mensagens_programadas')
      .select('id, clinica_id, nome, mensagem, dia, mes, ano, ativo, created_at')
      .eq('clinica_id', clinicaId)
      .order('mes', { ascending: true })
      .order('dia', { ascending: true })
    if (error) setToastMsg('Não foi possível carregar as mensagens programadas.')
    setCampanhas((data ?? []) as CampanhaMensagem[])
    setLoading(false)
  }, [clinicaId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const alternarAtivo = async (c: CampanhaMensagem) => {
    setCampanhas(prev => prev.map(x => (x.id === c.id ? { ...x, ativo: !x.ativo } : x)))
    const { error } = await supabase.from('mensagens_programadas').update({ ativo: !c.ativo }).eq('id', c.id).eq('clinica_id', clinicaId)
    if (error) {
      setCampanhas(prev => prev.map(x => (x.id === c.id ? { ...x, ativo: c.ativo } : x)))
      setToastMsg('Não foi possível ativar/desativar. Tente novamente.')
    }
  }

  const excluir = async (id: string) => {
    setConfirmDelete(null)
    const { error } = await supabase.from('mensagens_programadas').delete().eq('id', id).eq('clinica_id', clinicaId)
    if (error) { setToastMsg('Não foi possível excluir. Tente novamente.'); return }
    fetchAll()
  }

  if (!clinicaId) return (
    <Card title="Mensagens programadas" icon={Send}>
      <p className="text-sm text-text-secondary">Sua conta ainda não está vinculada a nenhuma clínica.</p>
    </Card>
  )

  const hoje = hojeSP()

  return (
    <>
      {criando && (
        <CampanhaModal clinicaId={clinicaId} onClose={() => setCriando(false)} onSaved={fetchAll} />
      )}
      {editando && (
        <CampanhaModal campanha={editando} clinicaId={clinicaId} onClose={() => setEditando(null)} onSaved={fetchAll} />
      )}

      <Card title="Mensagens programadas" icon={Send}>
        <p className="text-[11px] text-text-secondary mb-4">
          Envia para todos os clientes com WhatsApp no dia escolhido — Natal, Ano Novo, uma promoção. Cada cliente
          recebe uma vez por mensagem; quem está arquivado como Ex-Paciente fica de fora.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {campanhas.length === 0 && (
              <p className="text-sm text-text-secondary py-4 text-center">Nenhuma mensagem programada ainda.</p>
            )}

            {campanhas.map(c => {
              const proxima = proximaExecucao(c, hoje)
              return (
                <div key={c.id} className={`border rounded-xl transition-all ${c.ativo ? 'border-border' : 'border-border-subtle bg-surface-hover'}`}>
                  <div className="flex items-center gap-3 p-4">
                    <button onClick={() => alternarAtivo(c)}
                      title={c.ativo ? 'Desativar envio' : 'Ativar envio'}
                      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${c.ativo ? 'bg-accent' : 'bg-border'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${c.ativo ? 'left-4' : 'left-0.5'}`} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${c.ativo ? 'text-text-primary' : 'text-text-secondary'}`}>{c.nome}</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        <CalendarDays size={10} className="inline mr-1 -mt-0.5" />
                        {descreverData(c)}
                        {c.ativo
                          ? proxima ? ` · próximo envio ${fmtData(proxima)}` : ' · sem próxima data'
                          : ' · desativada'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setEditando(c)} title="Editar"
                        className="p-1.5 rounded-lg text-text-secondary hover:bg-page hover:text-accent transition-all">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDelete(c.id)} title="Excluir"
                        className="p-1.5 rounded-lg text-text-secondary hover:bg-status-danger-light hover:text-status-danger transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {confirmDelete === c.id && (
                    <div className="px-4 pb-4 flex items-center gap-3 border-t border-status-danger-light pt-3 bg-status-danger-light rounded-b-xl">
                      <p className="text-xs text-status-danger flex-1">Excluir a mensagem <strong>{c.nome}</strong>?</p>
                      <button onClick={() => setConfirmDelete(null)}
                        className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-hover transition-colors">Cancelar</button>
                      <button onClick={() => excluir(c.id)}
                        className="px-3 py-1.5 rounded-lg bg-status-danger text-white text-xs font-semibold hover:bg-status-danger/90 transition-colors">Excluir</button>
                    </div>
                  )}
                </div>
              )
            })}

            <button onClick={() => setCriando(true)}
              className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-border text-xs font-semibold text-text-secondary hover:border-accent hover:text-accent transition-all">
              <Plus size={13} /> Nova mensagem programada
            </button>
          </div>
        )}
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
      </Card>
    </>
  )
}
