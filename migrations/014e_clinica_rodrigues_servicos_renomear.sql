-- 014e: catálogo de serviços da Clínica Rodrigues fica só com os odontológicos, todos ativos.
--
-- Estado encontrado (consulta de leitura):
--   - 14 serviços estéticos antigos, todos inativos (criados em 2026-05-11).
--   - 21 serviços odontológicos inseridos pela 014d, todos ativos (criados em 2026-10-23).
--
-- O que faz:
--   1. Apaga os 21 serviços inseridos pela 014d (por id).
--   2. Renomeia os 14 antigos para nomes odontológicos e marca como ativos (mantém os ids).
--   3. Insere os 7 nomes odontológicos que não couberam nos 14 antigos.
--
-- Nenhuma tabela referencia servicos_clinica por chave estrangeira, então apagar
-- e renomear não quebra leads nem consultas. Os textos antigos gravados em
-- leads_clinica.procedimento_interesse e consultas.procedimento NÃO são alterados aqui.
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

-- 1. Apaga os 21 serviços inseridos pela 014d
delete from public.servicos_clinica
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  and id in (
    '29be8493-5b84-4931-9712-875a3c24d96d',
    '95a2e99f-3db5-4768-98c5-ef671cf6fd32',
    '5150a4d9-ba4e-4038-bbb7-072ec3037699',
    'c218fb20-4b82-4dd5-85b5-63bf1591a3e0',
    '86dcf77d-fc3d-4600-8edd-2e285691059e',
    'e74c4aa7-8a3b-47bc-bb5e-e8bcd3687811',
    '2db1d8df-9f92-4344-acbf-d027888f3114',
    '1b315776-6427-481a-9861-c1268a179b3e',
    '33d091a6-6f94-4369-9d96-1541f53a4371',
    '5d42df8f-2e15-48db-a0b6-08a26fbf4752',
    'c8fff994-cbcb-4cd0-83de-0d4ce8ae9b71',
    '03ad9403-eba3-44cd-a4c7-f3b62253c9ca',
    '224c2f71-4e99-4f05-8cea-fa44f07ad6f2',
    'a769fe01-a70a-4ffb-99a6-f5d22c011690',
    '10ae5bb7-b058-44f5-a212-4755eb1da57a',
    '3a756fcc-f5e0-43e6-b609-bb77f202b6b9',
    'ec2d2e96-7ed1-4802-a8ac-23abee070d46',
    'bb2ce65e-709c-429d-849a-27b089826a13',
    '2ecfa414-4baf-423e-8774-2a75823768c4',
    'baede7de-86ab-451d-9bfd-d18c6b7ce177',
    'ea1a83cb-60f0-4d00-b630-3e7d2f08ef83'
  );

-- 2. Renomeia os 14 antigos (mantém os ids) e ativa
update public.servicos_clinica s
set nome = v.nome, descricao = v.descricao, ativo = true
from (values
  ('74928568-cc1c-41ad-b9b6-14e679500eed'::uuid, 'Limpeza e profilaxia',            'Remoção de tártaro e placa bacteriana, com polimento dental.'),
  ('6a4fe367-0beb-48d8-a665-5e5f53d8be77'::uuid, 'Avaliação odontológica geral',    'Exame clínico completo, diagnóstico e plano de tratamento com orçamento.'),
  ('5817e054-8c89-49a5-8b08-3dc46c407c92'::uuid, 'Raspagem periodontal',            'Tratamento de gengivite e periodontite, com remoção de tártaro subgengival.'),
  ('515af21a-5b18-4f23-b41a-aeaa9d082d70'::uuid, 'Tratamento de cárie',             'Remoção do tecido cariado e restauração do dente.'),
  ('a0c9d510-ce98-4ae7-8423-1632ae5006b1'::uuid, 'Restauração em resina',           'Restauração estética em resina composta, na cor do dente.'),
  ('22d17c08-9fc1-49c1-b39f-5d8832f54fda'::uuid, 'Clareamento dental (consultório)', 'Clareamento realizado na clínica, em uma ou mais sessões.'),
  ('d35bc9ba-adbf-4817-912e-074547eee948'::uuid, 'Clareamento caseiro',             'Moldeiras personalizadas para clareamento em casa, com acompanhamento.'),
  ('0ddd5ab2-5e22-4dae-b0a0-8f406f71f803'::uuid, 'Tratamento de canal',             'Tratamento endodôntico para infecção ou inflamação da polpa dentária.'),
  ('809280c2-e84c-4836-932d-1e04b5728c7a'::uuid, 'Extração simples',                'Extração de dente sem complicações.'),
  ('b2aea789-c820-4797-be05-a94218e8345b'::uuid, 'Extração de siso',                'Extração de terceiro molar (siso), inclusive inclusos.'),
  ('d41edb31-985f-45d1-ace2-c7f6e4b8e5e1'::uuid, 'Implante dentário',               'Instalação de implante de titânio para reposição de dente perdido.'),
  ('b5703c88-cf22-4646-97a5-3e6fc90a090e'::uuid, 'Prótese sobre implante',          'Coroa ou prótese fixada sobre implante já osseointegrado.'),
  ('555b5b93-1b05-4bb1-8bc2-1e6666c7cbec'::uuid, 'Coroa protética',                 'Coroa total sobre dente tratado ou desgastado.'),
  ('26be8fae-8eeb-47d3-b8be-f18ca4b6c56a'::uuid, 'Faceta de porcelana',             'Lâmina de porcelana para correção estética de cor, forma e alinhamento.')
) as v(id, nome, descricao)
where s.id = v.id
  and s.clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44';

-- 3. Insere os 7 nomes que não couberam nos antigos
insert into public.servicos_clinica (clinica_id, nome, descricao, ativo)
select 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', v.nome, v.descricao, true
from (values
  ('Prótese parcial removível', 'Prótese para reposição de dentes ausentes, removível.'),
  ('Prótese total',             'Prótese para reposição de todos os dentes de uma arcada.'),
  ('Avaliação ortodôntica',     'Avaliação para tratamento de alinhamento e posicionamento dos dentes.'),
  ('Aparelho ortodôntico fixo', 'Instalação e manutenção de aparelho ortodôntico fixo (metálico ou estético).'),
  ('Alinhadores invisíveis',    'Alinhadores transparentes removíveis, sob planejamento ortodôntico.'),
  ('Odontopediatria',           'Atendimento odontológico para crianças, incluindo prevenção e restaurações.'),
  ('Atendimento de urgência',   'Atendimento para dor, trauma ou infecção dentária sem agenda prévia.')
) as v(nome, descricao)
where not exists (
  select 1 from public.servicos_clinica s
  where s.clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
    and s.nome = v.nome
);

-- 4. Conferência: deve listar exatamente 21 linhas, todas ativas, e nenhuma inativa
select count(*) as total, count(*) filter (where ativo) as ativos, count(*) filter (where not ativo) as inativos
from public.servicos_clinica
where clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44';

commit;
