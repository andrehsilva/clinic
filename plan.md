# Análise: transformar o CRM em multitenant (múltiplas clínicas)

## Estado atual (atualizado em 2026-07-13) — retomar por aqui

**Feito:**
- **Fase 1** (schema aditivo): colunas `clinica_id`/`numero_whatsapp` criadas em todas as tabelas relevantes (`migrations/001_multitenant_phase1.sql`).
- **Fase 4 concluída**: `src/contexts/AuthContext.tsx` central (busca `usuarios`+`configuracoes_clinica` uma vez só) consumido por `Sidebar`, `Dashboard`, `CRM`, `Leads`, `LeadDetail`, `Configuracoes`. Todas as queries dessas páginas filtram por `clinica_id` no client (RLS dessas tabelas de negócio ainda é "qualquer autenticado" — o isolamento real ainda depende desse filtro client-side, ver pendências). Realtime do CRM e do LeadDetail também escopados por `clinica_id`.
- **Dark mode**: `src/contexts/ThemeContext.tsx` + toggle no menu do usuário na Sidebar; paleta clara/escura via CSS variables (`tailwind.config.js` + `src/index.css`); todas as páginas migradas de hex cru para tokens; `src/lib/statusColors.ts` centraliza as cores de status (acabou a duplicação entre CRM/Leads/LeadDetail/Dashboard).
- **Gestão de usuários revista**: nova tabela `convites_clinica` (email + clinica_id) — o convite por e-mail já nasce vinculado à clínica certa; no primeiro login, `AuthContext` consome o convite e atribui o `clinica_id` automaticamente (acabou o passo manual de "vincular depois"). Nova aba **"Usuários" em `Configuracoes.tsx`**: qualquer usuário de uma clínica convida/vê/remove colegas da própria clínica, sem depender do super admin (só o *primeiro* usuário de uma clínica nova ainda depende do super admin). `/admin/clinicas` simplificado: convite exige escolher a clínica na hora, removida a opção de vincular por UID manual, e a tabela de clínicas agora mostra quantos/quais usuários (excluindo o super admin) já estão em cada uma.
- **Bug de RLS encontrado, migration pronta mas NÃO aplicada ainda** (`migrations/009_usuarios_rls_clinica.sql/.sh`): a policy de `usuarios` é `auth.uid() = id` — ninguém enxerga colegas da própria clínica nem o super admin vê quem está em cada clínica (por isso a listagem em `/admin/clinicas` e a aba "Usuários" pareciam vazias mesmo com gente cadastrada). A migration cria `current_clinica_id()`/`current_user_is_super_admin()` (security definer, evita recursão de RLS) e novas policies de SELECT/UPDATE permitindo ver/editar colegas da mesma clínica + super admin ver tudo. **Aguardando confirmação explícita do usuário para rodar em produção** (o auto-mode bloqueou a execução automática por ser mudança de segurança).
- Área administrativa em `/admin/clinicas` (só por URL direta, fora do menu). Coluna `usuarios.is_super_admin` criada (`migrations/003_admin_area.sh`); `andrehrsilva@gmail.com` é o único super admin.
- **3 clínicas cadastradas**: **Clínica Rodrigues** (id `dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44`, WhatsApp `5516991122235`) — a original, com 12 leads reais e 2 usuários (André Rodrigues super admin, Administradora); **Clínica Assis** (id `6872b646-9dd4-4de2-b397-1d1c8881eb8d`, WhatsApp `5516991122265`) — sem usuário nem leads ainda; **Bem Estar** (id `f7e65d81-21ad-4a9e-921a-c1de008b691c`, WhatsApp `5516991289152`) — 1 usuária real (Garbellini, via convite), sem leads.
- **Dados fake de teste removidos (2026-07-13)**: os 21 leads fake `(TESTE)` + 6 consultas fake criados antes pra popular as 3 clínicas foram todos apagados a pedido do usuário (confundiam mais do que ajudavam agora que dá pra testar com usuários reais). Os procedimentos clonados para Assis/Bem Estar continuam (são configuração real, não teste).
- **Campo `link_drive`** em `leads_clinica` (simples, manual — não confundir com a ideia maior de integração OAuth em `ideas/google-drive-por-clinica.md`, essa não foi implementada).
- **CRUD de consultas** (editar/excluir, além de criar) em `LeadDetail.tsx`.

**Pendente (nesta ordem):**
1. **Rodar a migration 009** (RLS de `usuarios` por clínica) — aguardando confirmação do usuário.
2. Vincular um usuário real à Clínica Assis (via nova aba "Usuários" de alguém já em outra clínica não funciona — precisa ser o super admin em `/admin/clinicas`, já que Assis ainda não tem ninguém).
3. RLS das tabelas de negócio (`leads_clinica`, `consultas`, `horario_comercial`, `servicos_clinica`, `configuracoes_clinica`) ainda é "qualquer autenticado" — Fase 3/cutover do plano original, decisão pendente sobre credencial do n8n (§3 abaixo) bloqueia isso.

**Nota:** o e-mail de convite depende do serviço de e-mail embutido do Supabase (gratuito, mas limitado em volume/hora) — se não chegar, checar Authentication → Providers → Email no painel do Supabase, e considerar configurar SMTP próprio antes de usar isso com clínicas reais em produção.

**Migrations já aplicadas ao banco de produção, em ordem:** `001_multitenant_phase1`, `002_add_link_drive`, `003_admin_area`, `004_grant_super_admin`, `006_classificacao_retorno`, `007_arquivar_ex_pacientes`, `005_backfill_clinica_rodrigues`, `008_convites_clinica`. **Ainda não aplicada:** `009_usuarios_rls_clinica` (aguardando confirmação do usuário).

---

## Resposta direta

**Sim, é possível.** A arquitetura atual (React SPA + Supabase) suporta bem um modelo multitenant com uma única instância compartilhada, isolando os dados por `clinica_id` + Row Level Security (RLS) do Postgres. Como cada clínica terá seu próprio número de WhatsApp, esse número vira a chave de roteamento que o fluxo n8n usa para descobrir a qual clínica um lead pertence antes de gravar no banco.

Não é uma mudança trivial — hoje o app assume "uma clínica só" em vários pontos (schema, RLS, queries do frontend, provisionamento de usuário) — mas nenhum desses pontos exige reescrever a aplicação; é uma migração incremental e segura em fases.

## Context

Hoje o sistema é single-tenant por construção:
- `configuracoes_clinica` sempre tem exatamente 1 linha (buscada com `.limit(1).maybeSingle()` em `Sidebar.tsx`, `Configuracoes.tsx`).
- Nenhuma tabela tem coluna de tenant (`clinica_id` ou similar).
- Todas as políticas RLS são "qualquer usuário autenticado vê/edita tudo" (`auth.role() = 'authenticated'`), exceto `usuarios` (escopado ao próprio `auth.uid()`).
- `leads_clinica` é escrito por um sistema externo (fluxo n8n + Chatwoot, via as colunas `id_conta_chatwoot`/`id_conversa_chatwoot`/`id_lead_chatwoot`/`inbox_id_chatwoot`) — o app React só lê/edita essas linhas, nunca fala com n8n/Chatwoot diretamente.
- `horario_comercial` (7 linhas, uma por dia da semana) e `servicos_clinica` (14 procedimentos) hoje são globais, sem escopo de clínica.
- Não existe fluxo de onboarding/signup — usuário é criado manualmente no painel do Supabase, e `Configuracoes.tsx` cria a linha em `usuarios` (e a única linha de `configuracoes_clinica`, se não existir) no primeiro login.

Decisões já validadas com você:
1. **Uma única instância compartilhada** (um projeto Supabase + um deploy do app) atende todas as clínicas — não um projeto por clínica.
2. **Roteamento do lead pelo número de WhatsApp de destino da clínica** — cada clínica cadastra seu número; o fluxo n8n resolve `clinica_id` a partir desse número antes de inserir o lead.
3. **Um usuário pertence a exatamente uma clínica** — sem seletor de clínica, sem tabela N:N.

## Arquitetura recomendada

### 1. Schema — `clinica_id` como coluna de isolamento

`configuracoes_clinica` vira a tabela raiz do tenant (já tem `nome_clinica`/`logo_url`, só precisa de mais uma coluna):

| Tabela | Mudança |
|---|---|
| `configuracoes_clinica` | + `numero_whatsapp text UNIQUE` — chave de lookup usada pelo n8n |
| `usuarios` | + `clinica_id uuid references configuracoes_clinica(id)` |
| `leads_clinica` | + `clinica_id uuid references configuracoes_clinica(id)`, indexado |
| `horario_comercial` | + `clinica_id uuid`, `UNIQUE (clinica_id, dia_semana)` — passa de 7 linhas globais para 7 por clínica |
| `servicos_clinica` | + `clinica_id uuid`, indexado — passa de lista global para lista por clínica |
| `consultas` | **sem mudança** — herda o tenant via `lead_id → leads_clinica.clinica_id` (evita duplicar `clinica_id` numa tabela pequena que sempre é acessada através do lead) |

### 2. RLS — de "qualquer autenticado" para "só da própria clínica"

Uma função auxiliar central evita repetir a mesma subquery em cada política e evita problemas de recursão de RLS:

```sql
create or replace function public.current_clinica_id()
returns uuid language sql stable security definer set search_path = public
as $$ select clinica_id from public.usuarios where id = auth.uid() $$;
```

Cada tabela troca sua política `for all using (auth.role() = 'authenticated')` por `using (clinica_id = current_clinica_id())` (em `consultas`, via `exists (... join leads_clinica ...)`).

### 3. Escrita externa (n8n) — decisão pendente que bloqueia a política de INSERT

`leads_clinica` recebe inserts de um ator diferente (n8n/Chatwoot), não do app. A política de INSERT depende de uma coisa que ainda não sabemos: **o fluxo n8n usa a `anon key` (sujeita a RLS) ou uma `service_role key` (ignora RLS)?**

- **Se for `service_role`** (recomendado, mais simples e mais seguro — essa chave nunca fica exposta no bundle JS público como a anon key já está): nenhuma política especial é necessária, o n8n resolve `clinica_id` via `numero_whatsapp` e insere direto.
- **Se for `anon`**: precisa de uma política de INSERT liberada para `anon` + uma função RPC restrita (`resolve_clinica_id(whatsapp) returns uuid`) para o n8n resolver o `clinica_id` sem expor a tabela toda de clínicas via SELECT anônimo.

**Ação necessária antes de implementar:** verificar qual credencial o fluxo n8n usa hoje para gravar em `leads_clinica`.

### 4. Provisionamento de nova clínica — área administrativa dedicada

Decisão confirmada: em vez de um runbook manual via SQL, o cadastro de novas clínicas será feito por uma **área administrativa dentro do próprio app** (não self-serve para clínicas — só para você/equipe interna, mas com UI em vez de SQL na mão). Isso introduz um componente novo na arquitetura, que hoje é um SPA puro sem backend próprio: uma pequena camada de funções server-side é necessária para a parte que não pode rodar com a `anon key`.

**Rota nova, ex. `/admin/clinicas`**, protegida por um novo `AdminRoute` (análogo ao `ProtectedRoute.tsx` atual, mas checando adicionalmente um flag `usuarios.is_super_admin boolean default false`) e **fora da navegação principal** do `Sidebar.tsx` (não aparece para secretárias comuns).

Duas partes distintas, com requisitos de segurança diferentes:

**a) Dados de clínica — RLS normal serve** (`configuracoes_clinica`, `horario_comercial`, `servicos_clinica`):
- Tela cria a clínica (`nome_clinica`, `numero_whatsapp`) e, no mesmo fluxo, semeia automaticamente as 7 linhas de `horario_comercial` (a UI de `TabHorarios` espera exatamente 7 linhas já existentes — sem elas a aba fica vazia sem forma de adicionar) e, opcionalmente, um conjunto padrão de `servicos_clinica`.
- Política RLS extra para permitir que super-admins leiam/escrevam em `configuracoes_clinica`/`horario_comercial`/`servicos_clinica` de **qualquer** clínica (não só a própria) — algo como `using (clinica_id = current_clinica_id() or exists (select 1 from usuarios where id = auth.uid() and is_super_admin))`, adicionada só nessas tabelas, mantendo o restante do isolamento intacto.

**b) Criar o primeiro usuário da clínica — requer uma Edge Function (novo componente)**:
- Criar um usuário em `auth.users` não é um INSERT de tabela normal — passa pela Auth Admin API do Supabase, que só funciona com a `service_role key`. Essa chave **nunca pode ir para o bundle do frontend** (o mesmo motivo pelo qual hoje só a `anon key` está em `.env`).
- Portanto: uma **Supabase Edge Function** (`admin-create-clinic-user`, por exemplo) recebe a requisição do admin logado, valida que quem chamou é `is_super_admin`, e só então usa a `service_role key` (guardada como secret da função, não no client) para chamar `auth.admin.createUser()` (ou `inviteUserByEmail()`, se preferir enviar convite por e-mail em vez de senha provisória) e inserir a linha em `usuarios` já com o `clinica_id` correto.
- Isso é a primeira peça de backend próprio do projeto — hoje ele é 100% SPA + Supabase client. Vale tratar como um item de escopo à parte dentro da fase de implementação (não é grande, mas é um tipo de componente novo: requer Supabase CLI para deploy de Edge Functions).
- Em paralelo, **remover** a lógica atual de `Configuracoes.tsx` que cria a linha de `usuarios` automaticamente no primeiro login (hoje ela não sabe de qual clínica o usuário é; deixá-la agindo assim criaria usuários "órfãos" sem `clinica_id` assim que existir mais de uma clínica).

### 5. Frontend — um hook/contexto central em vez de duplicar fetch de perfil

Hoje `Sidebar.tsx` e `Dashboard.tsx` já buscam usuário/clínica cada um por conta própria — esse padrão não deve se multiplicar. Criar `src/contexts/AuthContext.tsx` (Context + hook, sem nova dependência — mantém a filosofia atual do projeto de não usar Redux/React Query) que:
- Busca uma vez `usuarios` (incluindo `clinica_id`) + a linha correspondente de `configuracoes_clinica`.
- É consumido por `Sidebar.tsx`, `Dashboard.tsx`, `CRM.tsx`, `Leads.tsx`, `LeadDetail.tsx`, `Configuracoes.tsx` no lugar de cada um buscar por conta própria.
- Centraliza os listeners de `clinic-logo-updated`/`user-profile-updated` que hoje só o `Sidebar.tsx` escuta.

Com RLS ativo, a maioria das queries (`select`/`update`/`delete`) já vem automaticamente filtrada pela clínica do usuário — não é estritamente necessário adicionar `.eq('clinica_id', ...)` no client para isolamento (o RLS garante isso no servidor). Mas é obrigatório nos **inserts** (o `with check` da política RLS exige a coluna certa) e nos **paths de Storage** (logo por clínica: `clinic_logo_${clinicaId}` em vez do atual `clinic_logo` fixo/global). `configuracoes_clinica`'s `.limit(1).maybeSingle()` vira `.eq('id', clinicaId).single()` — falha alto e claro em vez de silenciosamente `null`.

### 6. Fases de execução (nenhuma quebra o app em produção)

1. **Aditiva**: adicionar todas as colunas `clinica_id`/`numero_whatsapp` como *nullable*, sem tocar RLS nem frontend — app continua funcionando exatamente como hoje.
2. **Backfill**: preencher `clinica_id` de todas as linhas existentes apontando para a clínica atual (que vira "clínica #1"); definir seu `numero_whatsapp`.
3. **Cutover** (coordenado): responder a pergunta do §3 (anon vs service role), então trocar as políticas RLS para o modelo escopado e tornar as colunas `NOT NULL`. Este passo **precisa** ir junto com o deploy do frontend atualizado (fase 4) — a janela entre eles deve ser mínima, pois o frontend antigo vai começar a falhar em inserts assim que o RLS mudar.
4. **Frontend**: subir o `AuthContext`, ajustar as páginas listadas acima, path de logo por clínica.
5. **Área administrativa**: criar a Edge Function `admin-create-clinic-user` (service role, guardado como secret), a rota `/admin/clinicas` + `AdminRoute`, a coluna `usuarios.is_super_admin`, e a política RLS extra de super-admin nas tabelas de configuração de clínica.
6. **Validação real**: usar a própria área administrativa para provisionar uma segunda clínica de verdade, ponta a ponta, e confirmar isolamento (inclusive testando que eventos Realtime de uma clínica não vazam para outra).

## Perguntas em aberto (não bloqueiam a resposta "é possível", mas bloqueiam a implementação)

1. O fluxo n8n grava em `leads_clinica` usando a `anon key` ou uma `service_role key`? (determina a política de INSERT)
2. O número de WhatsApp precisa de normalização de formato (E.164 vs. dígitos vs. formatado) tanto em `numero_whatsapp` quanto na lógica de matching do n8n — hoje `whatsapp_lead` é texto livre sem padrão nenhum.
3. Uma clínica nova nasce com os 14 procedimentos padrão (hoje pré-cadastrados, de cirurgia plástica) ou vazia?
4. As políticas dos buckets `avatars`/`logos` no Storage não estão neste repositório (provavelmente configuradas direto no painel do Supabase) — precisam ser auditadas e possivelmente escopadas por clínica também.

## Verificação

Depois de implementado, validar ponta a ponta:
1. `npm run build` passa (typecheck + build) sem erros.
2. Rodar o app localmente (`npm run dev`), logar com o usuário da clínica #1, confirmar que CRM/Leads/Dashboard/Configurações mostram só os dados dela.
3. Provisionar uma segunda clínica de teste (via a área administrativa) com um segundo usuário.
4. Logar com o segundo usuário e confirmar: zero leads/consultas/horários/procedimentos da clínica #1 aparecem; inserir um novo contato salva com o `clinica_id` correto.
5. Com as duas clínicas logadas em abas separadas do navegador, mover um card no Kanban (CRM) de uma clínica e confirmar que a outra aba **não** recebe o evento Realtime.
6. Testar o fluxo real de inserção do n8n (ou simular via SQL/API com a credencial que ele realmente usa) contra um número de WhatsApp cadastrado, confirmando que o lead cai na clínica certa.

## Arquivos centrais para implementação

- `setup_db.sh` — schema, RLS, seed (script fonte de verdade do banco)
- `src/App.tsx` — ponto de wrap do novo `AuthContext`
- `src/components/Sidebar.tsx` — remover fetch duplicado de perfil/clínica
- `src/pages/Dashboard.tsx`, `src/pages/CRM.tsx`, `src/pages/Leads.tsx`, `src/pages/LeadDetail.tsx` — queries escopadas por clínica
- `src/pages/Configuracoes.tsx` — remover auto-criação de `usuarios`/`configuracoes_clinica`; path de logo por clínica
