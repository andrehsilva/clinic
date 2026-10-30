-- 028: sinal explícito de paciente recorrente e contrato da flag mestre manual.
--
-- atendimento_manual já existe desde a migration 010. É a flag mestre para
-- os fluxos externos: todo workflow n8n que envia mensagens ou altera etapa
-- precisa ignorar leads com atendimento_manual = true. A UI deste app não pode
-- pausar workflows externos que não consultem esta coluna.
--
-- tag_paciente_recorrente é uma classificação independente do status e do
-- histórico de consultas; pode ser ligada/desligada pela secretaria no card.

begin;

alter table public.leads_clinica
  add column if not exists tag_paciente_recorrente boolean not null default false;

update public.leads_clinica
set tag_paciente_recorrente = true
where status in ('paciente_recorrente', 'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');

create or replace function public.marca_tag_paciente_recorrente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('paciente_recorrente', 'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano') then
    new.tag_paciente_recorrente := true;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_marca_tag_recorrente_trg on public.leads_clinica;
create trigger leads_marca_tag_recorrente_trg
  before insert or update of status, tag_paciente_recorrente on public.leads_clinica
  for each row
  execute function public.marca_tag_paciente_recorrente();

revoke all on function public.marca_tag_paciente_recorrente() from public, anon;
comment on column public.leads_clinica.atendimento_manual is
  'Flag mestre de atendimento manual. Workflows n8n devem excluir este lead antes de enviar mensagens ou alterar etapa.';

comment on column public.leads_clinica.tag_paciente_recorrente is
  'Tag explícita Paciente Recorrente, controlada pela secretaria e independente da etapa atual.';

commit;
