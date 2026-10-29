-- Catálogo de jogos da ReGenesis Arcade (tabela `public.games`).
--
-- Autoridade de segurança: Row Level Security NO BANCO. O frontend apenas
-- espelha os papéis; nada no cliente é barreira de segurança.
--
-- Visibilidade:
--   - anon/authenticated LÊM apenas jogos publicados (available = true);
--   - conta autenticada com app_metadata.role = 'admin' LÊ tudo (painel);
--   - somente admin INSERE/ALTERA/EXCLUI, verificado no JWT assinado.
--
-- O papel admin NÃO é auto-editável: app_metadata só muda via painel,
-- service role ou SQL (bootstrap no final deste arquivo).

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  entry text not null default '',
  available boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint games_title_length check (char_length(title) between 1 and 80),
  constraint games_description_length check (char_length(description) <= 280),
  constraint games_entry_length check (char_length(entry) <= 300)
);

alter table public.games enable row level security;

-- ---------------------------------------------------------------------
-- LEITURA

-- Visitantes anônimos e membros autenticados: somente jogos publicados.
drop policy if exists "catalogo_leitura_publica" on public.games;
create policy "catalogo_leitura_publica"
  on public.games for select
  to anon, authenticated
  using (available = true);

-- Admin autenticado: leitura completa, inclusive rascunhos (painel).
drop policy if exists "admin_leitura_completa" on public.games;
create policy "admin_leitura_completa"
  on public.games for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------------------
-- ESCRITA (somente admin; sempre verificado no JWT assinado pelo Supabase)

drop policy if exists "somente_admin_escreve" on public.games;
create policy "somente_admin_escreve"
  on public.games for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------------------
-- Privilégios de tabela (camada complementar ao RLS):
--   - anon recebe apenas SELECT (já filtrado por available = true);
--   - authenticated recebe SELECT + privilégios de escrita, mas o RLS
--     acima limita a escrita ao admin — usuário comum NÃO escreve
--     efetivamente, mesmo com o grant de tabela presente.

revoke all on table public.games from anon, authenticated;
grant select on table public.games to anon, authenticated;
grant insert, update, delete on table public.games to authenticated;

-- ---------------------------------------------------------------------
-- updated_at automático em QUALQUER edição (API, painel ou SQL direto),
-- independente do relógio do cliente.

create or replace function public.games_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
  before update on public.games
  for each row
  execute function public.games_touch_updated_at();

-- Índice para a ordenação do catálogo.
create index if not exists games_sort_order_idx on public.games (sort_order);

-- =====================================================================
-- BOOTSTRAP DO ADMIN (rode UMA vez no SQL Editor; troque o e-mail)
--
-- 1) Confirme que o filtro atinge exatamente UMA conta (deve retornar 1 linha):
--
--      select id, email
--      from auth.users
--      where email = lower('SEU_EMAIL_AQUI')
--        and aud = 'authenticated';
--
-- 2) Conceda o papel (idempotente; somente a conta do filtro é afetada):
--
--      update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                              || '{"role": "admin"}'::jsonb
--      where email = lower('SEU_EMAIL_AQUI')
--        and aud = 'authenticated';
--
-- 3) Confirme em Authentication > Users: app_metadata.role = "admin".
--    Depois recarregue a página (sem relogin) — o painel aparece.
--
-- Observações:
--   - `lower(email)` evita erro de maiúsculas/minúsculas do e-mail;
--   - `aud = 'authenticated'` restringe a contas da aplicação;
--   - o merge `||` sobrescreve apenas a chave "role" de app_metadata,
--     preservando o restante (ex.: provider do Google).
-- =====================================================================
