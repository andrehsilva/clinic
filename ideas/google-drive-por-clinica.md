> **Status: ideia em avaliação — ainda não aprovada para implementação.**
> Guardado aqui como referência para quando (e se) a decisão for tomada.

# Ideia: Documentos por Lead salvos no Google Drive da própria clínica

## Resposta direta

**É possível.** Cada clínica conecta a própria conta Google (OAuth), e o app cria uma pasta por lead dentro do Drive dela, faz upload dos documentos e mostra um link direto pra essa pasta — sem listagem, sem exclusão, sem gerenciamento de arquivos dentro do app.

Isso introduz o **primeiro componente de backend do projeto** (hoje é um SPA puro): trocar o código OAuth por tokens exige um `client_secret`, que nunca pode ir pro bundle do frontend, então precisa de uma Supabase Edge Function. É a mesma peça de infraestrutura nova que o plano multitenant (`plan.md`) já previa para outro motivo (`admin-create-clinic-user`) — vale construir a estrutura de Edge Functions uma vez e reaproveitar para os dois casos, se ambas forem adiante.

## Context

Hoje o app não tem nenhuma integração com Google (confirmado: zero menções a `google`/`drive`/`oauth` no código, exceto o preconnect de fontes do Google Fonts em `index.html`; nenhuma dependência `googleapis`/`gapi` no `package.json`) e não tem backend próprio nenhum (sem `supabase/functions/`, sem servidor — só o client Supabase com a `anon key` em `src/lib/supabase.ts`).

Padrões existentes relevantes:
- `src/pages/LeadDetail.tsx`: componente `Section` (linhas 82-94) usado para cada bloco da página (`Informações da IA`, `Histórico de Consultas`, `Anotações`, etc.). Layout em grid de 3 colunas (linha 321): coluna esquerda (`lg:col-span-2`, linhas 323-406) tem os blocos de conteúdo; ponto natural de inserção do novo bloco "Documentos" é logo depois de "Anotações" (depois da linha 405).
- `src/pages/Configuracoes.tsx`: componente `UploadAvatar` (linhas 25-86) é o padrão de upload mais próximo hoje — mas usa Supabase Storage, não Drive; serve só de referência visual (seletor de arquivo, spinner de "enviando", validação de tipo/tamanho, mensagem de erro).
- Plano multitenant (`plan.md`): Fase 1 (colunas `clinica_id` nullable) já está implementada em `configuracoes_clinica`, `usuarios`, `leads_clinica`, `horario_comercial`, `servicos_clinica`. Fases seguintes (RLS escopado por clínica, `AuthContext`, área administrativa) ainda não foram feitas.

Decisões discutidas (para retomar quando/se a ideia avançar):
1. **Cada clínica conecta a própria conta Google** (OAuth por clínica) — não uma conta central com pasta por clínica (opção descartada em conversa).
2. **Fluxo simples**: uma pasta por lead dentro do Drive da própria clínica; o app só faz upload e mostra o link da pasta. Sem listar arquivos, sem apagar, sem visualizar dentro do app — quem quiser ver os documentos abre o link e usa o Drive de verdade.
3. **Conta Google de cada clínica**: fica a critério dela (pessoal ou Workspace) — não é algo que este projeto gerencia ou decide.

## Arquitetura recomendada (se for adiante)

### 1. Google Cloud (configuração única do projeto, não por clínica)

- Um projeto Google Cloud, API do Google Drive habilitada, um OAuth Client ID/Secret tipo "Web application".
- Escopo `drive.file` (não o escopo amplo `drive`): o app só enxerga pastas/arquivos que ele mesmo cria — evita a revisão de segurança de escopos sensíveis do Google.
- **Atenção**: como são várias contas Google externas (uma por clínica) autorizando o app, ele precisa sair do modo "Testing" do OAuth consent screen do Google assim que passar de ~100 clínicas conectadas (limite do modo de teste). Isso exige alguns pré-requisitos básicos (política de privacidade pública, verificação de domínio), mais leve que a revisão de escopo sensível, mas não é zero esforço.

### 2. Fluxo de conexão por clínica (OAuth) — a parte mais delicada

- Em `Configuracoes.tsx`, um novo card "Google Drive" (aba "Integrações" ou dentro de "Perfil") mostrando status — conectado como `email@clinica.com` ou não conectado — com botão Conectar/Reconectar.
- Clique em Conectar → redireciona para o consentimento do Google (`accounts.google.com/o/oauth2/v2/auth`, `scope=drive.file`, `access_type=offline`, `prompt=consent` para garantir um `refresh_token`, mais um `state` como nonce anti-CSRF).
- Google redireciona de volta para uma rota do próprio app (ex. `/oauth/google/callback`, nova página React) com um `code` na URL.
- Essa rota chama uma **Edge Function** (`google-oauth-callback`) que:
  - Descobre a `clinica_id` do usuário logado a partir do próprio JWT dele (não confia no `state` para isso — `state` serve só como proteção anti-CSRF, como o OAuth pede).
  - Troca o `code` por `access_token`/`refresh_token` junto ao Google (usa o `client_secret`, que só existe no backend).
  - Grava o `refresh_token` associado à `clinica_id`.
- **Onde guardar o `refresh_token`**: em tabela nova `clinica_google_drive` (não em `configuracoes_clinica`, que hoje é lida livremente por qualquer usuário autenticado). RLS dessa tabela nova não deve permitir `SELECT` do `refresh_token` pelo client em nenhuma hipótese — só a Edge Function, usando a `service_role key`, lê essa coluna. O frontend só enxerga `email_conectado`/`connected_at` (para mostrar o status), nunca o token.

### 3. Upload + link (Edge Function)

Uma segunda Edge Function (`drive-upload`) que, dado `leadId` + arquivo:
1. Descobre a `clinica_id` do usuário logado (JWT) e busca o `refresh_token` daquela clínica (via `service_role`, nunca exposto ao client).
2. Troca o `refresh_token` por um `access_token` novo (chamada direta a `oauth2.googleapis.com/token` via `fetch` — sem a lib `googleapis`, que tem atrito em runtime Deno).
3. Get-or-create de uma pasta-raiz do app dentro do Drive da clínica (criada no momento da conexão, id salvo em `clinica_google_drive.drive_root_folder_id`, para não espalhar pastas soltas na raiz do Drive dela) e, dentro dela, get-or-create da pasta do lead (id cacheado em `leads_clinica.drive_folder_id`).
4. Upload do arquivo para a pasta do lead.
5. Retorna o link da pasta (`webViewLink`) para o frontend guardar/mostrar.

### 4. Frontend — `LeadDetail.tsx`

Novo `<Section title="Documentos">` no mesmo ponto de inserção identificado acima. Conteúdo mínimo:
- Se a clínica não conectou o Google Drive ainda (sem linha em `clinica_google_drive`): mensagem "Conecte o Google Drive em Configurações para enviar documentos", sem botão de upload.
- Se conectada: botão "Enviar documento" (mesmo esqueleto visual do `UploadAvatar`, mas chamando a Edge Function `drive-upload` via `fetch`/`FormData` em vez de Supabase Storage) e, após o primeiro upload, um link "Abrir pasta no Drive" usando o link cacheado.

### 5. Modelo de dados

- Tabela nova `clinica_google_drive (clinica_id uuid primary key references configuracoes_clinica(id), refresh_token text, email_conectado text, drive_root_folder_id text, connected_at timestamptz)`.
- `leads_clinica`: + `drive_folder_id text`, + `drive_folder_link text` (cache do link, evita chamada à Drive API só para montar a URL de novo).
- Sem tabela de auditoria de documentos por enquanto — não foi pedida listagem/gestão dentro do app; fica como possível próximo passo, não MVP.

### 6. Sequenciamento com o plano multitenant

- Depende de `clinica_id` existir (Fase 1 do multitenant, já feita). Sem o RLS multitenant (Fase 3, ainda não feita), a Edge Function precisa fazer a checagem manual de `usuarios.clinica_id` contra o lead — mesmo caveat já registrado no plano multitenant: é um reforço temporário, não substitui o RLS de verdade.
- Esta seria a primeira funcionalidade a exigir Edge Functions no projeto — se implementada perto da área administrativa do plano multitenant (que também precisa de uma), vale montar `supabase/functions/` (CLI, deploy, secrets) uma única vez e reaproveitar a estrutura para as duas.

## Perguntas em aberto / riscos

1. **Limite de contas em modo "Testing" do Google OAuth** — acima de ~100 clínicas conectadas, o app precisa avançar para o modo "In production" no consent screen (política de privacidade pública, verificação de domínio). Vale planejar com antecedência se a ideia avançar.
2. **Revogação de acesso** — se uma clínica revogar o acesso do app na própria conta Google (`myaccount.google.com/permissions`), o `refresh_token` salvo passa a falhar. A tela de Documentos precisaria detectar esse erro e voltar para o estado "não conectado", pedindo reconexão.
3. **Sem fallback de busca** — como não há listagem de arquivos dentro do app, se o link da pasta se perder (bug, `clinica_id` órfã) não existe forma fácil de reencontrar os documentos de um lead a não ser abrir o Drive da clínica manualmente e procurar. Risco aceito dado o pedido explícito de simplicidade — só registrando.
4. **Responsabilidade sobre a conta Google** — como cada clínica usaria a própria conta, a responsabilidade pelas configurações de privacidade/segurança dessa conta (2FA, compartilhamento, etc.) seria dela, não do app.

## Verificação (se implementado)

1. Conectar o Google Drive de uma clínica de teste em Configurações; confirmar que aparece o e-mail conectado.
2. Abrir um lead, enviar um documento, confirmar que a pasta é criada dentro do Drive real dessa clínica e o arquivo aparece lá dentro.
3. Confirmar que o link "Abrir pasta no Drive" leva exatamente para essa pasta.
4. Com uma segunda clínica de teste conectada (própria conta Google dela), confirmar que enviar um documento não afeta nem aparece na pasta da primeira clínica, e que o `refresh_token` de uma nunca é visível/acessível pela outra.
5. Revogar manualmente o acesso do app na conta Google de uma clínica de teste e confirmar que o app detecta o erro e sinaliza "reconectar" em vez de falhar silenciosamente.

## Arquivos centrais (se implementado)

- `src/pages/LeadDetail.tsx` — nova `Section` "Documentos"
- `src/pages/Configuracoes.tsx` — novo card/aba de conexão do Google Drive
- novo: `src/pages/OAuthCallback.tsx` (ou rota equivalente) + entrada em `src/App.tsx`
- novo: `supabase/functions/google-oauth-callback/index.ts`
- novo: `supabase/functions/drive-upload/index.ts`
- `setup_db.sh`/`migrations/` — tabela nova `clinica_google_drive`, colunas novas em `leads_clinica`
