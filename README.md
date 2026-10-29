# ReGenesis Arcade

**ReGenesis Arcade** (pasta local `game-ia`, antes *Game Com IA*) é uma plataforma web de jogos com identidade synthwave anos 80: o usuário cria uma conta, acessa uma hub com o catálogo de jogos publicados e tem o progresso de cada jogo salvo **por conta**.

> Status: autenticação e catálogo prontos; os jogos entram no catálogo aos poucos em `src/games/catalog.ts`. A autenticação remota depende de um projeto Supabase configurado em `.env.local`.

## Recursos

- Login, cadastro, recuperação de senha e sessão via **Supabase Auth** (fluxo PKCE), com callback em `/auth/callback`
- Hub pós-login com catálogo tipado e estado vazio honesto ("nenhum jogo disponível")
- Contrato de saves por conta (`userId` + `gameId` + versão) sobre `localStorage`, preparado para Supabase + RLS
- Música *8-bit rock* e efeitos sonoros gerados por **Web Audio** (sem arquivos de mídia), com controles no rodapé
- Visual synthwave neon responsivo, com semântica ARIA, foco visível e suporte a `prefers-reduced-motion`

## Stack

| Camada | Tecnologia |
| --- | --- |
| Linguagem | **TypeScript** (`strict`, verificação com `tsc --noEmit`) |
| Bundler | Vite |
| Auth / backend | Supabase (`@supabase/supabase-js`) |
| Testes | `node:test` + happy-dom |

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha URL e chave pública do Supabase
npm run dev                  # http://localhost:5173
```

Sem `.env.local` válido, a tela exibe um aviso seguro e o acesso remoto fica bloqueado — nada é simulado no código.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção em `dist/` |
| `npm run preview` | pré-visualiza o build |
| `npm test` | suíte de testes |
| `npm run typecheck` | checagem de tipos real (`tsc --noEmit`) |

## Estrutura

```
src/
├── auth/         # config, erros, metadata, cliente Supabase, serviço e controller
├── ui/           # AuthView + template da tela de acesso
├── games/        # catálogo de jogos publicados
├── persistence/  # repositório de progresso por conta
├── audio/        # preferências + motor 8-bit (Web Audio)
├── types/        # contratos de domínio compartilhados
└── main.ts       # entry da aplicação
tests/            # testes (node:test)
```

## Publicação

- **Hospedagem:** Cloudflare Pages, com publicação automática a cada push na branch `main`
- **Site:** https://project-game-ia.pages.dev
- **Variáveis de ambiente:** apenas chaves públicas com prefixo `VITE_` — nenhum segredo no frontend

Documentação: [`AUTENTICACAO.md`](./AUTENTICACAO.md) (fluxo de autenticação completo) e [`AGENTS.md`](./AGENTS.md) (padrões de desenvolvimento do projeto).
