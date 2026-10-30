import { useEffect, useState } from 'react'
import { Save, ChevronDown, ChevronUp, Rows3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { aplicarLayoutSimplificado, GABARITO, NICHOS, isNicho, type Etapa, type Nicho } from '../lib/funil'

const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card'

/**
 * Edição do nicho e das etapas do funil de UMA clínica (tenant).
 *
 * Vive na administração de clínicas, não nas configurações da clínica: quem
 * define o funil é o admin que gerencia os tenants. As chaves técnicas das
 * etapas não são editáveis — só rótulo, ordem e as duas regras —, então a
 * entrada de lead pelo WhatsApp continua funcionando.
 */
export function FunilEditor({ clinicaId, nicho, onSaved }: {
  clinicaId: string
  nicho: Nicho
  /** Chamado depois de salvar/aplicar, para o pai recarregar a clínica. */
  onSaved?: (nicho: Nicho) => void
}) {
  const [rows, setRows] = useState<Etapa[]>([])
  const [nichoAtual, setNichoAtual] = useState<Nicho>(nicho)
  const [nichoEscolhido, setNichoEscolhido] = useState<Nicho>(nicho)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmAplicar, setConfirmAplicar] = useState(false)
  const [confirmLayout, setConfirmLayout] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const carregar = async () => {
    const { data, error } = await supabase
      .from('funil_etapas')
      .select('chave, rotulo, ordem, exige_consulta_realizada, e_paciente, mapeia_para')
      .eq('clinica_id', clinicaId)
      .order('ordem', { ascending: true })
    if (error) setToastMsg('Não foi possível carregar o funil desta clínica.')
    setRows((data ?? []) as Etapa[])
    setDirty(false)
    setLoading(false)
  }

  useEffect(() => {
    setNichoAtual(nicho)
    setNichoEscolhido(nicho)
    carregar()
  }, [clinicaId, nicho])

  const ordenadas = [...rows.filter(r => !r.mapeia_para)].sort((a, b) => a.ordem - b.ordem)
  const dobradas = [...rows.filter(r => r.mapeia_para)].sort((a, b) => a.ordem - b.ordem)

  const atualizar = (chave: string, patch: Partial<Etapa>) => {
    setRows(prev => prev.map(r => (r.chave === chave ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const mover = (chave: string, delta: -1 | 1) => {
    const idx = ordenadas.findIndex(r => r.chave === chave)
    const atual = ordenadas[idx]
    const alvo = ordenadas[idx + delta]
    if (!atual || !alvo) return
    setRows(prev => prev.map(r =>
      r.chave === atual.chave ? { ...r, ordem: alvo.ordem }
      : r.chave === alvo.chave ? { ...r, ordem: atual.ordem }
      : r,
    ))
    setDirty(true)
  }
  const salvarLinhas = async (linhas: Etapa[], mensagem: string) => {
    setSaving(true)
    const results = await Promise.all(linhas.map(r =>
      supabase.from('funil_etapas').update({
        rotulo: r.rotulo.trim(),
        ordem: r.ordem,
        exige_consulta_realizada: r.exige_consulta_realizada,
        e_paciente: r.e_paciente,
        mapeia_para: r.mapeia_para,
      }).eq('clinica_id', clinicaId).eq('chave', r.chave),
    ))
    setSaving(false)
    if (results.some(r => r.error)) { setToastMsg('Não foi possível salvar o funil. Tente novamente.'); return }
    setRows(linhas)
    setDirty(false)
    onSaved?.(nichoAtual)
    setToastMsg(mensagem)
  }

  const salvar = async () => {
    if (rows.some(r => !r.rotulo.trim())) { setToastMsg('Todas as etapas precisam de um nome.'); return }
    await salvarLinhas(rows, 'Funil salvo.')
  }

  const aplicarLayout = async () => {
    setConfirmLayout(false)
    await salvarLinhas(aplicarLayoutSimplificado(rows), 'Layout simplificado aplicado.')
  }

  const rotuloOriginal = (chave: string) =>
    (GABARITO[nichoAtual] as Record<string, string>)[chave] ?? chave

  const aplicarNicho = async () => {
    setConfirmAplicar(false)
    setSaving(true)
    const { error } = await supabase.rpc('aplicar_nicho', {
      p_clinica: clinicaId,
      p_nicho: nichoEscolhido,
      p_sobrescrever: true,
    })
    setSaving(false)
    if (error) { setToastMsg('Não foi possível aplicar o modelo do nicho. Tente novamente.'); return }
    setNichoAtual(nichoEscolhido)
    await carregar()
    onSaved?.(nichoEscolhido)
    setToastMsg('Modelo do nicho aplicado.')
  }

  const nomeNicho = NICHOS.find(n => n.value === nichoEscolhido)?.label ?? nichoEscolhido

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-border rounded-xl p-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">Simplificar colunas</p>
          <p className="text-xs text-text-secondary mt-1">Agrupa Reagendado e Reengajamento em Orçamento em Negociação e reduz as colunas visíveis.</p>
        </div>
        <button type="button" onClick={() => setConfirmLayout(true)} disabled={saving}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark disabled:opacity-60">
          <Rows3 size={14} /> Aplicar layout enxuto
        </button>
      </div>
      {confirmLayout && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm text-text-primary">Reagendado, Reengajamento e suas etapas relacionadas aparecem em Orçamento em Negociação. Retorno continua separado. Para o modo manual suspender mensagens, cada fluxo do n8n precisa ignorar leads com atendimento_manual = true.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmLayout(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary">Cancelar</button>
            <button type="button" onClick={aplicarLayout} disabled={saving} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark disabled:opacity-60">Confirmar</button>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Etapas do funil</p>
        <p className="text-[11px] text-text-secondary mt-1 mb-3">
          O nome original identifica o fluxo; o nome editável é o que aparece para a equipe.
        </p>
        <div className="space-y-2">
          {ordenadas.map((r, i) => (
            <div key={r.chave} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-border rounded-xl p-3">
              <div className="flex gap-1">
                <button type="button" onClick={() => mover(r.chave, -1)} disabled={i === 0}
                  className="p-1 rounded-md text-text-secondary hover:text-text-primary disabled:opacity-30" aria-label="Subir"><ChevronUp size={14} /></button>
                <button type="button" onClick={() => mover(r.chave, 1)} disabled={i === ordenadas.length - 1}
                  className="p-1 rounded-md text-text-secondary hover:text-text-primary disabled:opacity-30" aria-label="Descer"><ChevronDown size={14} /></button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] leading-4 text-text-secondary">{rotuloOriginal(r.chave)}</p>
                <input value={r.rotulo} onChange={e => atualizar(r.chave, { rotulo: e.target.value })}
                  aria-label={`Nome da coluna ${rotuloOriginal(r.chave)}`}
                  className={inputCls} />
              </div>
              <div className="flex gap-3 text-xs text-text-secondary whitespace-nowrap">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={r.exige_consulta_realizada}
                    onChange={e => atualizar(r.chave, { exige_consulta_realizada: e.target.checked })} />
                  Exige consulta
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={r.e_paciente}
                    onChange={e => atualizar(r.chave, { e_paciente: e.target.checked })} />
                  Pacientes
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={salvar} disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60">
            <Save size={14} /> Salvar funil
          </button>
        </div>
      </div>

      {dobradas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Etapas dobradas</p>
          <p className="text-[11px] text-text-secondary mt-1 mb-3">
            Elas continuam valendo para o WhatsApp, mas os leads aparecem na etapa em que são dobradas.
          </p>
          <div className="space-y-2">
            {dobradas.map(r => (
              <div key={r.chave} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-border rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] leading-4 text-text-secondary">{rotuloOriginal(r.chave)}</p>
                  <p className="text-sm text-text-primary">{r.rotulo}</p>
                </div>
                <span className="text-[11px] text-text-secondary">
                  aparece em {rows.find(x => x.chave === r.mapeia_para)?.rotulo ?? r.mapeia_para}
                </span>
                <button type="button" onClick={() => atualizar(r.chave, { mapeia_para: null })}
                  className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors">
                  Exibir como coluna
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-secondary mt-2">
            Para voltar a dobrar, aplique o modelo do nicho.
          </p>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  )
}
