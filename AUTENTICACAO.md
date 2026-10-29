# Autenticação do ReGenesis Arcade

## Estado desta entrega

Implementação local com o SDK oficial `@supabase/supabase-js`. Login, cadastro,
recuperação e nova senha compartilham a **mesma interface**. O callback técnico
usa `/auth/callback`, sem página de cadastro separada.

**Configuração local:** a URL e a chave pública do Supabase **game-ia** são lidas
de `.env.local`. Quando ainda não estiverem preenchidas, a tela informa a ausência
de configuração e bloqueia as chamadas. Ter a configuração não equivale a homologar
cadastro, e-mail ou Google no serviço real.

Não houve acesso ao Supabase remoto, envio real de e-mail, login Google real,
execução de SQL, alteração de configuração remota ou publicação nesta implementação.
As tabelas de Tamer/Digimon/perfil não são necessárias nem consultadas nesta etapa.
**Não aplique as migrações de jogo existentes para habilitar o Auth.**

## 1. Configurar apenas os dados públicos

No painel Supabase, selecione o projeto **game-ia**. Em **Connect** ou em
**Project Settings → API / API Keys**, obtenha:

- **Project URL**, por exemplo `https://<project-ref>.supabase.co`.
- **Publishable key**, com prefixo `sb_publishable_`.
- Se só houver o formato legado, use a chave **anon / public**, nunca `service_role`.

Na raiz do projeto, copie `.env.example` para `.env.local` e substitua os exemplos:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

O formato recomendado para `VITE_SUPABASE_URL` é a **URL raiz do projeto**:
`https://<project-ref>.supabase.co`, com barra final opcional. Não use a URL do painel,
callback, tabelas, parâmetros, fragmentos ou credenciais na URL.

O painel também oferece bases das APIs `auth/v1`, `rest/v1`, `storage/v1`,
`functions/v1` e `realtime/v1`. A validação reconhece apenas essas bases exatas,
opcionalmente com barra final, em um host oficial `*.supabase.co` via HTTPS e porta
padrão, e usa a origem do mesmo projeto. Não altera `.env.local` nem a chave recebida.
Outros caminhos continuam bloqueados; não há remoção indiscriminada de caminhos.

Alternativa legada: usar `VITE_SUPABASE_ANON_KEY` no lugar da publishable.
Não mantenha uma chave de exemplo inválida na outra variável. O arquivo `.env.local`
é ignorado pelo Git. Reinicie o Vite após alterar as variáveis.

Nenhuma senha administrativa, chave `sb_secret_`, `service_role`, SMTP/Brevo ou
Google Client Secret é necessária. Valores `VITE_` entram no JavaScript público.
O Vite valida a configuração antes do build, rejeitando os tipos de segredo conhecidos
e chaves JWT cujo papel não seja `anon`. Isso não torna arbitrários segredos seguros
para incluir no frontend: as duas variáveis acima recebem somente dados públicos.

Os valores reais não foram inventados nem preenchidos pelo agente.

## 2. Abrir localmente

```powershell
npm.cmd install
npm.cmd run dev
```

Abra **http://localhost:5173**. O servidor usa porta fixa e `strictPort`.
Se a porta estiver ocupada, confira o servidor já aberto e encerre-o manualmente,
se apropriado, antes de iniciar outro. O agente não encerra processos desconhecidos.

Não alterne para `127.0.0.1` ou outra porta durante os fluxos: são origens distintas
e não estão na lista de retorno aprovada do projeto. `npm.cmd run preview` serve
para inspecionar o build, mas sua origem padrão não é autorizada para iniciar Auth.

Endereços permitidos no código:

```text
http://localhost:5173/auth/callback
https://project-game-ia.pages.dev/auth/callback
```

A configuração remota informada pelo usuário foi respeitada. Domínios, Google OAuth
e listas de redirecionamento não foram modificados. Para publicação futura, preencher
as mesmas variáveis públicas no ambiente autorizado do Cloudflare Pages, em uma etapa
separada de autorização; esta entrega não faz deploy.

## 3. Como os fluxos funcionam

| Fluxo | API oficial |
| --- | --- |
| Cadastro | `auth.signUp()` com `emailRedirectTo` |
| Login | `auth.signInWithPassword()` |
| Google | `auth.signInWithOAuth()` com PKCE |
| Solicitar recuperação | `auth.resetPasswordForEmail()` |
| Concluir callback PKCE | `auth.exchangeCodeForSession()` |
| Link `token_hash` compatível, se já configurado no template | `auth.verifyOtp()` |
| Nova senha | `auth.updateUser({ password })` |
| Verificar/restaurar sessão | `auth.getSession()` e `auth.getUser()` |
| Sair deste navegador | `auth.signOut({ scope: 'local' })` |

- Com a confirmação de e-mail habilitada, o cadastro não libera uma sessão antes
  da confirmação. A interface usa uma mensagem neutra e não cria nickname/Tamer.
- O formulário valida e-mail, senha preenchida, mínimo de oito caracteres para
  senha nova e confirmação idêntica. A política real do Supabase pode ser mais
  restritiva e permanece autoritativa. Senhas nunca são aparadas ou normalizadas.
- Cadastro e recuperação não informam se um endereço existe. Erros brutos do SDK,
  URLs de erro e detalhes internos não são exibidos nem registrados pelo aplicativo.
- O usuário é validado com `getUser()`; uma sessão cacheada sozinha não autoriza
  a entrada. A identidade é conferida novamente após a resposta para detectar troca
  de conta enquanto a requisição estava pendente.
- Se o cache existir mas a validação falhar, há botões para tentar validar ou sair
  e entrar novamente. Não se prende o usuário em um login bloqueado pelo cache antigo.
- Há um cliente SDK e um listener central por documento. Os eventos são processados
  fora do callback do SDK, sem aguardar outras chamadas Auth dentro dele.
- O SDK administra persistência, renovação e comunicação entre abas. O aplicativo
  revalida ao restaurar, voltar ao foco e no prazo de expiração informado pela sessão.
- Mudanças de identidade cancelam requisições Auth antigas e descartam respostas
  antes de sua leitura pelo SDK. Isso evita restaurar A com um login atrasado após
  B assumir a sessão. Cancelar o cliente não desfaz uma operação já aceita pelo servidor.

### Callback e recuperação

- `auth/callback.html` é entrada multipágina nativa do Vite. O build produz esse HTML;
  o Cloudflare Pages pode servi-lo no caminho sem extensão `/auth/callback`.
- O callback usa o mesmo `src/main.js`, template e estilos da tela principal.
- `detectSessionInUrl` está desabilitado. Somente o serviço do jogo troca o código.
- O código e os parâmetros sensíveis são capturados e removidos da URL antes das
  operações assíncronas. Não são copiados para logs ou metadados próprios.
- O parâmetro `sb_flow_id` do SDK 2.118 é repassado explicitamente para a troca,
  mesmo após a limpeza da URL. Não é descartado nem substituído por outro verifier.
- Uma Promise única evita a troca duplicada na página. Web Locks serializam callbacks
  entre abas quando disponíveis; uma sessão já existente impede a segunda troca.
- Sem Web Locks, a deduplicação local e a validação de uso único do Supabase continuam
  ativas, mas a serialização entre abas depende dos mecanismos disponíveis no navegador.
- O resultado `redirectType = recovery` ou um `verifyOtp` válido de recovery abre
  nova senha antes de qualquer entrada no jogo. Um parâmetro `type` sozinho não autoriza.
- A tela de nova senha pode ser restaurada por até 15 minutos de UX, com um marcador
  por usuário no namespace do Auth. O marcador não contém tokens nem substitui sessão
  válida. Esse prazo não altera a expiração remota do link de e-mail.
- A alteração valida o usuário esperado e o JWT efetivamente enviado pelo SDK no
  `PUT /auth/v1/user`, bloqueando alteração de B por uma ação iniciada para A.
- Depois de mudar a senha, sai da sessão local e solicita login com a nova senha.
- Link inválido, consumido, expirado ou sem verifier apresenta orientação para pedir
  outro. Fluxos implícitos antigos com tokens no fragmento não são aceitos automaticamente.
- Um callback com sessão já existente é recusado para evitar trocar contas silenciosamente.
  Saia, inicie um novo fluxo e use o novo link. Logout do SDK remove verifiers pendentes.
- PKCE normalmente exige o mesmo navegador e origem que iniciaram o pedido. Abrir
  o link em outro dispositivo pode falhar; não há fallback que invente uma sessão.

O suporte a `token_hash` não modifica templates remotos: usa apenas os tipos
`signup`, `email` e `recovery` se um template existente já enviar esse formato.

## 4. Entrada autenticada e hub da plataforma

Após login validado, aparece o estado de entrada da conta, sem formulário de nickname
e sem consulta a `player_profiles` ou tabelas de jogo.

A tela pós-login é a **hub da plataforma**: apresenta a conta autenticada e a área onde
os jogos publicados serão listados para o usuário. Enquanto nenhum jogo estiver
disponível, é exibido um aviso de que a coleção está vazia.

**O progresso de cada jogo ficará associado à conta autenticada** quando os jogos e a
persistência remota por conta forem integrados em etapa futura. Até lá, a hub apenas
confirma a identidade e oferece saída.

O SDK persiste somente sua própria sessão no navegador, em namespace
`game-ia:auth:<host-do-projeto>:v1`. Seus tokens são sensíveis e administrados pelo SDK;
não são senhas e não devem ser copiados para logs. Há metadados próprios somente para
estado de recuperação e saída pendente, sem credenciais. Não se usa `localStorage.clear()`.
Se o navegador bloquear armazenamento persistente, a restauração após recarregar
pode não estar disponível. A homologação deve ser feita com armazenamento permitido.

Logout encerra a sessão e retorna à tela de acesso. Se houver falha ao confirmar a saída
no serviço, a interface oferece retry e mantém um sinalizador para tentar concluir ao
recarregar. Isso não promete invalidar instantaneamente todo JWT emitido ou encerrar
outros dispositivos.

## 5. Testes automatizados e limites

```powershell
npm.cmd run test:auth
npm.cmd test
npm.cmd run build
```

Novas suítes:

- `tests/auth/authService.test.js`: validações, APIs e redirecionamentos, neutralidade,
  sessão oficial, callback único, serialização, recuperação e proteção de identidade.
- `tests/auth/authController.test.js`: estados, loading, confirmação, respostas atrasadas,
  expiração, troca A/B, logout e repositórios temporários independentes.
- `tests/auth/authView.test.js`: DOM com Happy DOM, formulários na mesma tela, acessibilidade,
  limpeza de senhas, alternância por teclado e ausência de HTML injetado por mensagens.
- `tests/auth/supabaseTransport.test.js`: SDK oficial com HTTP falso, validando updateUser
  e bloqueio de JWT pertencente à outra conta no instante da mutação.

Happy DOM é dependência exclusiva de desenvolvimento. Esses testes de Auth usam
contas e respostas fictícias; **não validam o projeto Supabase remoto**. As suítes
PostgreSQL existentes continuam separadas e não aplicam migrações remotamente.

Resultados da verificação local:

| Verificação | Resultado |
| --- | --- |
| `npm.cmd test` | Testes de Auth aprovados, zero falhas ou omissões |
| `npm.cmd run build` | Aprovado, com HTMLs principal e callback |
| Rotas HTTP do Vite | `/` e `/auth/callback` responderam 200 com o HTML esperado |
| Chrome com Auth simulado | Cadastro, A/B, restauração, recuperação PKCE, nova senha e OAuth simulado aprovados |
| Responsividade no Chrome | 1440×900, 768×1024, 375×812 e 320×568, sem overflow horizontal |
| Build sem configuração | Instruções visíveis, envio desabilitado e nenhuma chamada Auth |
| Supabase remoto / e-mail / Google reais | **Não executados**; dependem da configuração pública e da conta de teste do usuário |

A correção da validação de URL foi verificada com o `.env.local` real, sem exibir
seus valores e sem alterar seu conteúdo: `npm.cmd run dev` iniciou em localhost:5173,
e `/` e `/auth/callback` responderam HTTP 200. A instância temporária foi encerrada
após a verificação. Isso confirma inicialização local, não autenticação remota.

Também foi verificada a interface no Chrome headless, com endpoints Auth interceptados
e respostas simuladas: cadastro, login A/B, restauração, callback de recuperação,
nova senha e retorno OAuth simulado.
A porta 5173 estava ocupada; a verificação usou um build isolado em `.cache` e respostas
locais interceptadas, preservando o servidor existente. Nenhum pedido foi para um
Supabase real, Google OAuth real ou serviço de e-mail durante essa verificação.

## 6. Roteiro manual com sua conta de teste

Depois de preencher `.env.local`, reiniciar o Vite e abrir `http://localhost:5173`:

1. **Cadastro:** abra Criar conta, informe um e-mail seu, senha e confirmação.
   Teste senhas divergentes. Envie o cadastro; confira a mensagem neutra.
2. **E-mail:** confira caixa de entrada e spam. Abra o link no mesmo navegador/origem.
   Verifique se o retorno passa por `/auth/callback`, limpa a URL e chega à entrada
   autenticada. Não há garantia de entrega apenas pela mensagem da interface.
3. **Login:** saia, entre por e-mail/senha e teste credenciais incorretas. Confira
   mensagens em português, loading e ausência de detalhes internos.
4. **Restauração:** recarregue a entrada autenticada; a conta correta deve reaparecer
   após validação oficial. Falta de rede deve impedir entrada não verificada.
5. **Hub:** após o login, a tela mostra a conta autenticada e a área de jogos (vazia por enquanto). Não há demonstração de jogo nesta etapa.
6. **Troca A/B:** se tiver duas contas de teste suas, saia de A e entre em B, inclusive por outra aba. O estado anterior deve ser substituído pela nova conta.
7. **Recuperação:** estando deslogado, clique Esqueci minha senha e solicite o e-mail.
   Abra o link recebido no mesmo navegador; deve aparecer Defina sua nova senha,
   nunca a demonstração automaticamente. Recarregar não deve pular essa etapa.
8. **Nova senha:** teste confirmação divergente e depois uma senha válida. O aplicativo
   deve pedir novo login. Teste novamente com a senha nova e depois a antiga.
9. **Links:** reutilize um link consumido ou um link que já tenha expirado naturalmente.
   Deve aparecer erro seguro, sem loop. Não altere expirações remotas para este teste.
10. **Google:** deslogado, use Entrar com Google com uma conta já autorizada no modo
    Testing. Verifique ida ao provedor e retorno. Cancelar deve retornar uma mensagem
    segura. Não altere OAuth Client ID, modo Testing ou redirect URLs nesta etapa.
11. **Sessão:** confirme que a sessão persiste ao recarregar e que sair encerra o acesso, solicitando novo login.
12. **Logout:** sair deve retornar à tela de acesso. Teste também falha de rede e o botão de tentar sair novamente.

Não cole senhas, tokens de sessão, links completos de recuperação ou segredos em logs,
capturas compartilhadas ou mensagens de erro. Para relatar falha, informe o passo,
a mensagem pública exibida e o navegador, sem credenciais.

## 7. Pendências de homologação real

- Manter os valores públicos corretos do projeto game-ia em `.env.local`; a leitura
  e a validação locais já foram verificadas sem expor os valores.
- Executar o roteiro manual usando sua própria conta de teste e os e-mails recebidos.
- Verificar efetivamente entrega/spam no Brevo/Supabase e o fluxo Google Testing.
- Verificar no Cloudflare Pages somente após futura autorização de publicação.
- Nenhuma migração de perfil é necessária: toda a identidade desta entrega é do Auth nativo.
- Arquitetura DMO, nickname, persistência remota e importação continuam em standby.

Parecer: implementação local pronta para configuração e homologação real do Auth.
Não é declaração de que cadastro, Google ou e-mail já foram testados no projeto remoto.

## Arquivos desta implementação

- `index.html`: shell da tela única de autenticação.
- `auth/callback.html`: retorno técnico com a mesma interface e código principal.
- `src/main.js`: composição do Auth, interface e coordenador de sessão.
- `src/auth/authConfig.js`, `supabaseClient.js`, `authService.js`: configuração pública,
  SDK oficial, transporte protegido e operações Auth.
- `src/auth/authReturn.js`, `authMetadata.js`, `authErrors.js`, `AuthController.js`:
  callback, estado, mensagens seguras e isolamento.
- `src/ui/AuthView.js`, `src/ui/authScreen.html`: interface única e acessibilidade.
- `src/styles/auth.css`: visual da plataforma.
- `tests/auth/*.test.js`, `tests/helpers/fakeAuth.js`: testes com dados fictícios.
- `.env.example`, `vite.config.js`, `package.json`, `package-lock.json` e este documento.

Não há código de jogo 3D neste projeto: o `game-ia` é a plataforma web de acesso e
catálogo de jogos. O progresso por conta será integrado quando os jogos e a
persistência remota forem adicionados.

## Pap�is: admin (dono) e member (usu�rio comum)

- **admin**: �nica conta que publica, edita, despublica e exclui jogos no cat�logo (painel vis�vel na hub p�s-login).
- **member**: usu�rio comum � v� apenas jogos publicados, joga e tem o progresso salvo por conta.
- O papel vem de `app_metadata.role = "admin"` no Supabase. `app_metadata` **n�o � edit�vel pelo usu�rio** (s� via painel, service role ou SQL); valores inesperados caem sempre em `member`.

### Definir sua conta como admin (uma vez)

1. Crie o projeto Supabase e configure `.env.local`.
2. Rode a migra��o `supabase/migrations/20261029130000_catalog_games.sql` no SQL Editor (cria a tabela `games` com RLS: leitura p�blica, escrita s� admin).
3. Rode tamb�m o comando de bootstrap indicado no final da migra��o (troque o e-mail pelo seu). Depois, em **Authentication ? Users**, sua conta deve mostrar `app_metadata.role: "admin"`.

Sem esse passo, nenhuma conta tem acesso de escrita � o painel admin n�o aparece e o RLS bloqueia mutations.
