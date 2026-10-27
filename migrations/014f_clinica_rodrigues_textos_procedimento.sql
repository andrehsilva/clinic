-- 014f: troca os textos antigos de procedimento nos leads e consultas da Clínica Rodrigues.
--
-- Atinge:
--   - leads_clinica.procedimento_interesse (exibido no CRM e na lista de leads)
--   - consultas.procedimento (exibido no detalhe do lead)
--
-- Mapeamento:
--   - Procedimentos estéticos, "Apenas consulta de rotina" e "Padrão" -> "Avaliação odontológica geral"
--   - "Avaliacão periodica" -> "Limpeza e profilaxia"
--   - "Retorno por dor" -> "Atendimento de urgência"
--   - "Retorno" e "Retorno " ficam como estão (genéricos)
--
-- Antes de alterar, cria a tabela public.backup_procedimentos_clinica_rodrigues_014f
-- com os valores originais (RLS ativado e sem políticas, então só o banco acessa).
-- Para desfazer, use a tabela de backup para restaurar os valores por id.
--
-- Rodar no SQL Editor do Supabase, em uma transação.

begin;

do $$
begin
  if not exists (
    select 1 from public.configuracoes_clinica
    where id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
      and nome_clinica ilike '%rodrigues%'
  ) then
    raise exception 'Clínica Rodrigues não encontrada com o id esperado. Confira o id antes de continuar.';
  end if;
end;
$$;

-- 0. Backup dos valores originais
create table public.backup_procedimentos_clinica_rodrigues_014f as
select 'lead'::text as origem, l.id as registro_id, l.procedimento_interesse as valor_original
from public.leads_clinica l
where l.clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
union all
select 'consulta'::text, c.id, c.procedimento
from public.consultas c
join public.leads_clinica l on l.id = c.lead_id
where l.clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44';

alter table public.backup_procedimentos_clinica_rodrigues_014f enable row level security;

-- 1. Leads
update public.leads_clinica
set procedimento_interesse = case procedimento_interesse
  when 'Lipoaspiração'            then 'Avaliação odontológica geral'
  when 'Lipo HD'                  then 'Avaliação odontológica geral'
  when 'Lipoaspiração de Braços'  then 'Avaliação odontológica geral'
  when 'Braquioplastia'           then 'Avaliação odontológica geral'
  when 'Cruroplastia'             then 'Avaliação odontológica geral'
  when 'Gluteoplastia'            then 'Avaliação odontológica geral'
  when 'Mastopexia'               then 'Avaliação odontológica geral'
  when 'Body Lift'                then 'Avaliação odontológica geral'
  when 'Abdominoplastia'          then 'Avaliação odontológica geral'
  when 'Mamoplastia de Aumento'   then 'Avaliação odontológica geral'
  when 'Apenas consulta de rotina' then 'Avaliação odontológica geral'
  else procedimento_interesse
end
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  and procedimento_interesse in (
    'Lipoaspiração', 'Lipo HD', 'Lipoaspiração de Braços', 'Braquioplastia', 'Cruroplastia',
    'Gluteoplastia', 'Mastopexia', 'Body Lift', 'Abdominoplastia', 'Mamoplastia de Aumento',
    'Apenas consulta de rotina'
  );

-- 2. Consultas
update public.consultas c
set procedimento = case c.procedimento
  when 'Padrão'               then 'Avaliação odontológica geral'
  when 'Avaliacão periodica'  then 'Limpeza e profilaxia'
  when 'Retorno por dor'      then 'Atendimento de urgência'
  else c.procedimento
end
from public.leads_clinica l
where l.id = c.lead_id
  and l.clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  and c.procedimento in ('Padrão', 'Avaliacão periodica', 'Retorno por dor');

-- 3. Conferência: deve listar só os nomes novos e genéricos
select procedimento_interesse as procedimento, count(*) as leads
from public.leads_clinica
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
group by procedimento_interesse
order by leads desc;

commit;
