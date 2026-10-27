-- 014: configura a Clínica Rodrigues como odontológica.
--
-- Pré-requisito: a migration 013 precisa estar aplicada (coluna nicho e tabela funil_etapas).
--
-- Rodar no SQL Editor do Supabase. Não usa public.aplicar_nicho(): no SQL Editor
-- não há auth.uid(), então a função recusaria a execução. Por isso o gabarito
-- é gravado direto, com os mesmos valores de gabarito_funil('odontologica').
--
-- Tudo acontece numa transação: se qualquer passo falhar, nada é gravado.

begin;

-- Confere que o id é mesmo da Clínica Rodrigues antes de mexer em qualquer coisa.
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

-- 1. Nicho da clínica
update public.configuracoes_clinica
set nicho = 'odontologica'
where id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44';

-- 2. Etapas do funil com o gabarito odontológico (sobrescreve rótulos e ordem)
insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente)
select 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente
from public.gabarito_funil('odontologica') g
on conflict (clinica_id, chave) do update
  set rotulo = excluded.rotulo,
      ordem = excluded.ordem,
      exige_consulta_realizada = excluded.exige_consulta_realizada,
      e_paciente = excluded.e_paciente;

-- 3. Conferência: deve listar 12 etapas, na ordem, com os rótulos odontológicos
select chave, rotulo, ordem, exige_consulta_realizada, e_paciente
from public.funil_etapas
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
order by ordem;

commit;
