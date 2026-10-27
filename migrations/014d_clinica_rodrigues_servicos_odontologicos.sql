-- 014d: troca o catálogo de serviços da Clínica Rodrigues pelo catálogo odontológico.
--
-- O que faz:
--   1. Desativa (ativo = false) os serviços atuais da clínica. Não apaga nada,
--      então o histórico continua e dá para reativar pela tela Configurações.
--   2. Insere os serviços odontológicos, pulando os que já existirem pelo nome.
--
-- Não depende da migration 013. Pode rodar antes ou depois dela.
-- Rodar no SQL Editor do Supabase, em uma transação.
--
-- Rollback (reativa os antigos e desativa os odontológicos desta lista):
--   update public.servicos_clinica set ativo = true
--    where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44' and nome not in (<lista abaixo>);

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

-- 1. Desativa o catálogo atual (estético)
update public.servicos_clinica
set ativo = false
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  and ativo = true;

-- 2. Serviços odontológicos
insert into public.servicos_clinica (clinica_id, nome, descricao, ativo)
select 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', v.nome, v.descricao, true
from (values
  ('Avaliação odontológica geral',    'Exame clínico completo, diagnóstico e plano de tratamento com orçamento.'),
  ('Limpeza e profilaxia',            'Remoção de tártaro e placa bacteriana, com polimento dental.'),
  ('Raspagem periodontal',            'Tratamento de gengivite e periodontite, com remoção de tártaro subgengival.'),
  ('Tratamento de cárie',             'Remoção do tecido cariado e restauração do dente.'),
  ('Restauração em resina',           'Restauração estética em resina composta, na cor do dente.'),
  ('Clareamento dental (consultório)', 'Clareamento realizado na clínica, em uma ou mais sessões.'),
  ('Clareamento caseiro',             'Moldeiras personalizadas para clareamento em casa, com acompanhamento.'),
  ('Tratamento de canal',             'Tratamento endodôntico para infecção ou inflamação da polpa dentária.'),
  ('Extração simples',                'Extração de dente sem complicações.'),
  ('Extração de siso',                'Extração de terceiro molar (siso), inclusive inclusos.'),
  ('Implante dentário',               'Instalação de implante de titânio para reposição de dente perdido.'),
  ('Prótese sobre implante',          'Coroa ou prótese fixada sobre implante já osseointegrado.'),
  ('Coroa protética',                 'Coroa total sobre dente tratado ou desgastado.'),
  ('Prótese parcial removível',       'Prótese para reposição de dentes ausentes, removível.'),
  ('Prótese total',                   'Prótese para reposição de todos os dentes de uma arcada.'),
  ('Faceta de porcelana',             'Lâmina de porcelana para correção estética de cor, forma e alinhamento.'),
  ('Avaliação ortodôntica',           'Avaliação para tratamento de alinhamento e posicionamento dos dentes.'),
  ('Aparelho ortodôntico fixo',       'Instalação e manutenção de aparelho ortodôntico fixo (metálico ou estético).'),
  ('Alinhadores invisíveis',          'Alinhadores transparentes removíveis, sob planejamento ortodôntico.'),
  ('Odontopediatria',                 'Atendimento odontológico para crianças, incluindo prevenção e restaurações.'),
  ('Atendimento de urgência',         'Atendimento para dor, trauma ou infecção dentária sem agenda prévia.')
) as v(nome, descricao)
where not exists (
  select 1 from public.servicos_clinica s
  where s.clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
    and s.nome = v.nome
);

-- 2b. Se já existia um serviço com o mesmo nome (e foi desativado no passo 1), reativa.
update public.servicos_clinica
set ativo = true
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  and nome in (
    'Avaliação odontológica geral', 'Limpeza e profilaxia', 'Raspagem periodontal',
    'Tratamento de cárie', 'Restauração em resina', 'Clareamento dental (consultório)',
    'Clareamento caseiro', 'Tratamento de canal', 'Extração simples', 'Extração de siso',
    'Implante dentário', 'Prótese sobre implante', 'Coroa protética',
    'Prótese parcial removível', 'Prótese total', 'Faceta de porcelana',
    'Avaliação ortodôntica', 'Aparelho ortodôntico fixo', 'Alinhadores invisíveis',
    'Odontopediatria', 'Atendimento de urgência'
  );

-- 3. Conferência: ativos devem ser só os odontológicos
select nome, ativo
from public.servicos_clinica
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
order by ativo desc, nome;

commit;
