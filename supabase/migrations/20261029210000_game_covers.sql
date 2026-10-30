-- Capa de imagem dos jogos (Supabase Storage + coluna na tabela).
--
-- Dependência: rode ANTES esta migração a 20261029130000_catalog_games.sql
-- (tabela public.games precisa existir).
--
-- Decisão de arquitetura: o banco guarda só o CAMINHO do objeto
-- (`cover_path`); o frontend deriva a URL pública no serviço. O bucket é
-- público para LEITURA; ESCRITA é exclusivamente de app_metadata.role =
-- 'admin', com MIME e tamanho limitados TAMBÉM no servidor (não só no
-- cliente, que é barreira fraca).

-- ---------------------------------------------------------------------
-- 1) Coluna de caminho da capa

alter table public.games
  add column if not exists cover_path text not null default '';

do $$
begin
  alter table public.games
    add constraint games_cover_path_length check (char_length(cover_path) <= 300);
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2) Bucket público de capas (limite de 5 MB e MIMEs de imagem no servidor)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-covers',
  'game-covers',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 3) LEITURA: qualquer um (anon/authenticated) lê capas do bucket

drop policy if exists "capas_leitura_publica" on storage.objects;
create policy "capas_leitura_publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'game-covers');

-- ---------------------------------------------------------------------
-- 4) ESCRITA: somente admin (verificado no JWT assinado), só neste bucket
--    e só extensões de imagem (o bucket já restringe por MIME também).

drop policy if exists "somente_admin_envia_capa" on storage.objects;
create policy "somente_admin_envia_capa"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'game-covers'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and lower(coalesce(storage.extension(name), '')) in ('png', 'jpg', 'jpeg', 'webp', 'gif', 'avif')
  );

drop policy if exists "somente_admin_atualiza_capa" on storage.objects;
create policy "somente_admin_atualiza_capa"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'game-covers'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'game-covers'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- DELETE é necessário: o serviço apaga a capa antiga ao trocar e ao
-- excluir o jogo (limpeza de arquivo).
drop policy if exists "somente_admin_apaga_capa" on storage.objects;
create policy "somente_admin_apaga_capa"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'game-covers'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ---------------------------------------------------------------------
-- 5) Privilégios de tabela (camada complementar às policies):
--    anon lê apenas; escrita concedida a authenticated, efetiva só via
--    policy de admin acima.

revoke all on storage.objects from anon;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;
