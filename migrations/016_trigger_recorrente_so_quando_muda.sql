-- 016: o trigger que move o lead para "paciente_recorrente" só dispara quando a
-- consulta VIRA "realizada" (inserção nova, ou troca de status para realizada).
--
-- Problema: o trigger trg_marca_lead_recorrente (migration 006) dispara em
-- "after insert or update of status". O modal de consulta envia o campo status
-- em todo salvamento, então editar uma consulta já realizada (observação, valor)
-- rebaixava o lead para "paciente_recorrente", apagava data_prevista_retorno e
-- sobrescrevia data_virou_recorrente. Um lead em "retornar_6_meses" saía da coluna.
--
-- Correção: só age quando o status é 'realizada' E (é um insert OU o status mudou).
-- O próprio trigger continua igual; só a função muda.
--
-- Rollback: rodar a definição antiga da função (migration 006, linhas 36-52).
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase.

begin;

create or replace function public.marca_lead_recorrente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'realizada'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.leads_clinica
    set status = 'paciente_recorrente',
        data_virou_recorrente = new.data_consulta,
        data_prevista_retorno = null
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

commit;
