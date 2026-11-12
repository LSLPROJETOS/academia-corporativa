# Academia Corporativa

## Organização

- `index.html` carrega os arquivos em `assets/css/index/` e `assets/js/index/`.
- `supabase/schema.sql` define o banco, as políticas RLS e o Storage.
- `supabase/migration-regras-no-servidor.sql` aplica as regras de negócio do servidor e os RPCs usados pelo front-end.
- `supabase/migration-estrutura-organizacional.sql` adiciona organizações, unidades, setores, vínculos e isolamento organizacional.
- `supabase/bootstrap-admin.sql` é executado manualmente no Supabase para configurar a primeira conta administrativa.

O perfil permite montar um personagem visual, usado no menu, no perfil e no ranking. Em projetos Supabase já existentes, faça primeiro um backup e execute, nessa ordem, `supabase/schema.sql`, `supabase/migration-regras-no-servidor.sql` e `supabase/migration-estrutura-organizacional.sql` no SQL Editor do Supabase. Valide as migrações em staging antes da produção. A função `ranking_xp` calcula os placares semanal e mensal sem expor o histórico detalhado de pontos. O ranking considera a semana de segunda a domingo e o mês do calendário, atualizando os períodos automaticamente.

## Estrutura organizacional

- `organizations`, `units` e `sectors` usam IDs UUID próprios; setores de unidades distintas podem ter o mesmo nome.
- `memberships` permite vários vínculos por pessoa, com funções `organization_admin`, `unit_admin`, `sector_manager` e `collaborator`. O perfil global `admin` continua sendo o administrador geral; a autenticação existente não é substituída.
- Os módulos continuam usando `app_records`, agora com `organization_id`, `unit_id`, `sector_id`, `created_by` e `status`. Chaves estrangeiras compostas, triggers, RPCs e RLS validam os vínculos no servidor.
- O administrador geral cria a primeira organização em **Administração → Organizações**. A criação também concede a ele um vínculo de administrador da organização e seleciona esse escopo. Cadastre unidades e setores, depois associe as contas existentes aos escopos e funções adequados.
- Contas sem vínculo ativo não recebem acesso aos dados organizacionais. A conta global `admin` mantém acesso administrativo para configurar a estrutura.
- Registros anteriores são mantidos sem classificação (`organization_id` vazio); não são atribuídos automaticamente. O administrador geral pode associá-los individualmente nessa área, após confirmar sua origem. Revise esses registros antes de conceder acesso. Organizações, unidades, setores e vínculos são desativados logicamente; a migração não apaga registros antigos.
- `profiles.points` e `profiles.xp` continuam sendo atributos globais da conta, conforme o comportamento existente; a migração não distribui saldos históricos entre organizações. Portanto, eles não representam carteiras independentes por organização.
- O seletor de organização, unidade e setor atualiza a consulta ativa. A autorização efetiva continua sendo aplicada pelo PostgreSQL/RLS, inclusive em chamadas diretas à API e nos arquivos privados.

Os testes transacionais estão em `supabase/tests/estrutura-organizacional.sql`. Execute-os somente em staging/desenvolvimento com uma conta ativa não administradora; o script exige essa conta de teste e termina com `ROLLBACK`. Incluem setores de mesmo nome, múltiplos vínculos, isolamento entre organizações/setores, associação incompatível, desativação lógica e prevenção de duplicatas. A concorrência deve também ser exercitada com sessões simultâneas em staging.

O mural mostra até três publicações na página inicial e mantém um histórico completo em **Atualizações**. A equipe pode criar comunicados, novidades e melhorias, salvar rascunhos, agendar ou fixar publicações e anexar imagens.

Os estilos estão divididos em `base`, `navigation`, `components` e `pages`. Os scripts são carregados em ordem e separados em `data`, `security`, `helpers`, `rules`, `demo`, `navigation`, `learner`, `admin` e `events`. Como os scripts são clássicos (não módulos ES), mantenha a ordem das referências no HTML.

No editor da prova, a equipe pode gerar sugestões de múltipla escolha localmente, sem enviar o conteúdo a um serviço externo. Para evitar alternativas desconexas, o gerador usa estruturas explícitas: etapas identificadas (por exemplo, `ETAPA 1: PLANEJAMENTO`), quantidades destacadas em negrito, siglas com iniciais destacadas (por exemplo, `**O**uvir, **R**econhecer, **A**gir`) e processos em listas numeradas com pelo menos três passos. Se não encontrar uma dessas estruturas, não cria perguntas. Revise as sugestões e salve-as antes de liberá-las.

Cada pessoa pode escolher entre o tema claro e o tema escuro com degradê em **Minha conta**. O degradê existente é mantido como tema padrão.

## Segurança: limites atuais e próximos passos

- HTML, CSS e JavaScript entregues ao navegador podem ser lidos e copiados. Separar arquivos melhora manutenção, mas não protege o código-fonte.
- A chave `publishable` do Supabase é usada no navegador e não deve ser tratada como senha. Nunca coloque uma chave `service_role` ou outro segredo em arquivos públicos.
- As políticas RLS em `supabase/schema.sql` são parte essencial do controle de acesso. Mudanças de perfil e permissões devem continuar protegidas no banco, não apenas por verificações JavaScript.
- Pontos, progresso, tentativas, certificados e inscrições devem ser alterados pelos RPCs da migração `supabase/migration-regras-no-servidor.sql`; aplique-a no Supabase antes de publicar o front-end correspondente.
- A validação e a autorização no navegador melhoram a experiência, mas não substituem validação no servidor e políticas RLS.
- PHP só deve ser introduzido como backend real, hospedado em servidor configurado, para operações que precisam de confiança ou segredos. Apenas renomear páginas para `.php` não protege o conteúdo que ainda é enviado ao navegador. A migração requer definir a hospedagem e a interface entre PHP, Supabase e a autenticação atual.

## Executar

Abra `index.html` para acessar a plataforma. Em produção, sirva os arquivos por HTTPS e mantenha as políticas RLS do Supabase habilitadas.
