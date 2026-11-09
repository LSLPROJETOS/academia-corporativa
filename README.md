# Academia Corporativa

## Organização

- `index.html` carrega os arquivos em `assets/css/index/` e `assets/js/index/`.
- `supabase/schema.sql` define o banco, as políticas RLS e o Storage.
- `supabase/bootstrap-admin.sql` é executado manualmente no Supabase para configurar a primeira conta administrativa.

O perfil permite montar um personagem visual, usado no menu, no perfil e no ranking. Em projetos Supabase já existentes, execute novamente `supabase/schema.sql` para incluir as atualizações do perfil e a função `ranking_xp`, usada para calcular os placares semanal e mensal sem expor o histórico detalhado de pontos. O ranking considera a semana de segunda a domingo e o mês do calendário, atualizando os períodos automaticamente.

Os estilos estão divididos em `base`, `navigation`, `components` e `pages`. Os scripts são carregados em ordem e separados em `data`, `security`, `helpers`, `rules`, `demo`, `navigation`, `learner`, `admin` e `events`. Como os scripts são clássicos (não módulos ES), mantenha a ordem das referências no HTML.

No editor da prova, a equipe pode gerar sugestões de múltipla escolha localmente, sem enviar o conteúdo a um serviço externo. Para evitar alternativas desconexas, o gerador usa estruturas explícitas: etapas identificadas (por exemplo, `ETAPA 1: PLANEJAMENTO`), quantidades destacadas em negrito, siglas com iniciais destacadas (por exemplo, `**O**uvir, **R**econhecer, **A**gir`) e processos em listas numeradas com pelo menos três passos. Se não encontrar uma dessas estruturas, não cria perguntas. Revise as sugestões e salve-as antes de liberá-las.

Cada pessoa pode escolher entre o tema claro e o tema escuro com degradê em **Minha conta**. O degradê existente é mantido como tema padrão.

## Segurança: limites atuais e próximos passos

- HTML, CSS e JavaScript entregues ao navegador podem ser lidos e copiados. Separar arquivos melhora manutenção, mas não protege o código-fonte.
- A chave `publishable` do Supabase é usada no navegador e não deve ser tratada como senha. Nunca coloque uma chave `service_role` ou outro segredo em arquivos públicos.
- As políticas RLS em `supabase/schema.sql` são parte essencial do controle de acesso. Mudanças de perfil e permissões devem continuar protegidas no banco, não apenas por verificações JavaScript.
- Pontos, progresso, tentativas e certificados são dados com impacto de negócio. As gravações atualmente partem do cliente; antes de produção, valide quais valores precisam ser calculados ou confirmados por uma função confiável no servidor/banco, para que o usuário não possa definir seu próprio resultado.
- A validação e a autorização no navegador melhoram a experiência, mas não substituem validação no servidor e políticas RLS.
- PHP só deve ser introduzido como backend real, hospedado em servidor configurado, para operações que precisam de confiança ou segredos. Apenas renomear páginas para `.php` não protege o conteúdo que ainda é enviado ao navegador. A migração requer definir a hospedagem e a interface entre PHP, Supabase e a autenticação atual.

## Executar

Abra `index.html` para acessar a plataforma. Em produção, sirva os arquivos por HTTPS e mantenha as políticas RLS do Supabase habilitadas.
