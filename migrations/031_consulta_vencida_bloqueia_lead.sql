-- 031: bloquear edições até classificar consulta vencida.
-- Aplicar depois de 030_endurece_funil_enxuto.sql.

begin;

create or replace function public.consulta_exige_classificacao_vencida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'agendada' and old.data_consulta <= clock_timestamp() then
      raise exception 'Consulta vencida precisa ser classificada como realizada, cancelada ou faltou antes de excluir.';
    end if;
    return old;
  end if;

  if new.status = 'agendada' and new.data_consulta <= clock_timestamp() then
    raise exception 'O horário desta consulta já passou. Classifique como realizada, cancelada ou faltou.';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'agendada'
     and old.data_consulta <= clock_timestamp() then
    if new.status not in ('realizada', 'cancelada', 'faltou') then
      raise exception 'Consulta vencida precisa ser classificada como realizada, cancelada ou faltou.';
    end if;
    if new.data_consulta is distinct from old.data_consulta
       or new.procedimento is distinct from old.procedimento
       or new.valor_pago is distinct from old.valor_pago
       or new.observacoes is distinct from old.observacoes then
      raise exception 'Classifique a consulta vencida sem alterar os demais dados.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a_consulta_exige_classificacao_vencida_trg on public.consultas;
create trigger a_consulta_exige_classificacao_vencida_trg
  before insert or update or delete on public.consultas
  for each row execute function public.consulta_exige_classificacao_vencida();

create or replace function public.lead_bloqueia_acao_com_consulta_vencida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() <= 1
     and exists (
       select 1 from public.consultas c
       where c.lead_id = old.id
         and c.status = 'agendada'
         and c.data_consulta <= clock_timestamp()
     ) then
    raise exception 'Este lead tem uma consulta vencida. Classifique-a como realizada, cancelada ou faltou antes de continuar.';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_bloqueia_acao_consulta_vencida_trg on public.leads_clinica;
create trigger leads_bloqueia_acao_consulta_vencida_trg
  before update on public.leads_clinica
  for each row execute function public.lead_bloqueia_acao_com_consulta_vencida();

revoke all on function public.consulta_exige_classificacao_vencida() from public, anon, authenticated;
revoke all on function public.lead_bloqueia_acao_com_consulta_vencida() from public, anon, authenticated;

commit;
