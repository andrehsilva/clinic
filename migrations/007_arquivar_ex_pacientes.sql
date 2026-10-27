-- "Ex-paciente" / arquivamento — não é mais uma etapa do funil (não vira coluna
-- no Kanban, não vira status novo), é uma flag independente do `status`.
-- Objetivo: dar um lugar para leads/pacientes inativos sem sujar as colunas do
-- CRM nem os funis de "Contatos"/"Pacientes" em Leads.tsx. O `status` do lead
-- é preservado enquanto arquivado — se a secretária reativar (ou uma nova
-- consulta for registrada), ele volta exatamente de onde parou.
--
-- Executado via migrations/007_arquivar_ex_pacientes.sh (gitignored, contém o
-- token de Management API do Supabase — mesmo padrão do setup_db.sh).

-- ─── 1. Colunas novas em leads_clinica ─────────────────────────────────────
alter table public.leads_clinica
  add column if not exists arquivado    boolean not null default false,
  add column if not exists arquivado_em timestamptz;

-- ─── 2. marca_lead_recorrente: reativa automaticamente se uma nova consulta
--         for registrada como realizada (o paciente "voltou") ─────────────
create or replace function public.marca_lead_recorrente()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'realizada' then
    update public.leads_clinica
    set status = 'paciente_recorrente',
        data_virou_recorrente = new.data_consulta,
        data_prevista_retorno = null,
        arquivado = false,
        arquivado_em = null
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

-- ─── 3. verifica_retornos_proximos: ignora leads arquivados (não reaparecem
--         sozinhos no Kanban enquanto estiverem marcados como ex-paciente) ─
create or replace function public.verifica_retornos_proximos()
returns void
language plpgsql
security definer
as $$
begin
  update public.leads_clinica
  set status = 'follow_up_1_feito'
  where status in ('retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano')
    and arquivado = false
    and data_prevista_retorno is not null
    and data_prevista_retorno <= now() + interval '30 days';
end;
$$;
