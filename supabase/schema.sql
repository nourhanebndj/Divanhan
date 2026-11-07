-- =========================================================
-- Le Gourmet Tlemcen : base de données de la carte
-- À exécuter dans Supabase > SQL Editor.
-- Le script peut être relancé sans créer de doublons.
-- =========================================================


-- =========================================
-- TABLES
-- =========================================

create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  slug       text not null unique,
  name       text not null check (length(trim(name)) > 0),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.dishes (
  id           bigint generated always as identity primary key,
  category_id  bigint not null references public.categories (id) on delete restrict,
  name         text not null check (length(trim(name)) > 0),
  description  text not null default '',
  price        integer check (price >= 0),  -- en dinars ; vide = prix non affiché
  photo        text,                        -- URL Supabase ou chemin ./assets/...
  is_available boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists dishes_category_id_idx on public.dishes (category_id);
create index if not exists dishes_position_idx on public.dishes (position);

-- Comptes autorisés à modifier la carte.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);


-- =========================================
-- CONTRÔLE D'ACCÈS
-- Les inscriptions Supabase sont ouvertes par défaut : être connecté
-- ne suffit donc pas, il faut figurer dans public.admins.
-- =========================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

alter table public.categories enable row level security;
alter table public.dishes     enable row level security;
alter table public.admins     enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.dishes to anon, authenticated;
grant insert, update, delete on public.categories, public.dishes to authenticated;
grant select on public.admins to authenticated;
revoke insert, update, delete on public.admins from anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;


-- CATÉGORIES

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select to anon, authenticated
  using (true);

drop policy if exists "categories_admin_insert" on public.categories;
create policy "categories_admin_insert" on public.categories
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "categories_admin_update" on public.categories;
create policy "categories_admin_update" on public.categories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "categories_admin_delete" on public.categories;
create policy "categories_admin_delete" on public.categories
  for delete to authenticated
  using ((select public.is_admin()));


-- PLATS : le public ne voit que les plats disponibles.

drop policy if exists "dishes_public_read" on public.dishes;
create policy "dishes_public_read" on public.dishes
  for select to anon, authenticated
  using (is_available or (select public.is_admin()));

drop policy if exists "dishes_admin_insert" on public.dishes;
create policy "dishes_admin_insert" on public.dishes
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "dishes_admin_update" on public.dishes;
create policy "dishes_admin_update" on public.dishes
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "dishes_admin_delete" on public.dishes;
create policy "dishes_admin_delete" on public.dishes
  for delete to authenticated
  using ((select public.is_admin()));


-- ADMINS : chacun peut seulement vérifier son propre statut.
-- Les ajouts se font uniquement depuis le SQL Editor.

drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self" on public.admins
  for select to authenticated
  using (user_id = auth.uid());


-- =========================================
-- STOCKAGE DES PHOTOS
-- Bucket public en lecture. SVG exclu car il peut contenir du script.
-- =========================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,  -- 5 Mo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "menu_images_admin_select" on storage.objects;
create policy "menu_images_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()));

drop policy if exists "menu_images_admin_insert" on storage.objects;
create policy "menu_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and (select public.is_admin()));

drop policy if exists "menu_images_admin_update" on storage.objects;
create policy "menu_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()))
  with check (bucket_id = 'menu-images' and (select public.is_admin()));

drop policy if exists "menu_images_admin_delete" on storage.objects;
create policy "menu_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()));


-- =========================================
-- DONNÉES INITIALES (reprises de data/menu.json)
-- =========================================

insert into public.categories (slug, name, position) values
  ('salades',   'Salades',   1),
  ('grillades', 'Grillades', 2),
  ('gratins',   'Gratins',   3),
  ('pates',     'Pâtes',     4),
  ('pizzas',    'Pizzas',    5),
  ('bowls',     'Bowls',     6),
  ('burgers',   'Burgers',   7),
  ('sandwichs', 'Sandwichs', 8),
  ('desserts',  'Desserts',  9),
  ('boissons',  'Boissons',  10)
on conflict (slug) do nothing;

-- Ajoutés seulement si la table est vide, pour ne jamais écraser
-- ni recréer ce qui a été modifié depuis le dashboard.
insert into public.dishes (category_id, name, description, price, photo, position)
select c.id, d.name, d.description, d.price, d.photo, d.position
from (values
  ('salades',   'Salade César',                 'Poulet, laitue, fromage et sauce César maison.',          600,  './assets/images/menu/salade_cesar.jpeg',      1),
  ('salades',   'Cocktail Prestige Go',         'Quinoa, avocat, saumon fumé et sauce citronnée.',         1200, './assets/images/menu/cocktail_prestige.webp', 2),
  ('grillades', 'Filet de Poulet Grillé',       'Filet de poulet tendre et savoureux.',                    800,  './assets/images/menu/filet_poulet.jpeg',      3),
  ('grillades', 'Côtelettes d''Agneau Grillées', 'Côtelettes d''agneau grillées.',                          2000, './assets/images/menu/cotelettes_agneau.jpeg', 4),
  ('gratins',   'Gratin Crevettes',             'Pommes de terre, crevettes et fromage gratiné.',          800,  './assets/images/menu/gratin_crevettes.jpg',   5),
  ('pizzas',    'Pizza BBQ Maline',             'Viande, poulet, fromage et sauce BBQ.',                   900,  './assets/images/menu/pizza_bbq.jpeg',         6),
  ('pates',     'Pasta Bolognaise',             'Pâtes, sauce bolognaise à la viande hachée et fromage.',  700,  './assets/images/menu/pasta_bolognaise.jpeg',  7),
  ('burgers',   'Super Burger',                 'Double viande, œuf, fromage et sauce Go.',                600,  './assets/images/menu/super_burger.jpeg',      8),
  ('desserts',  'Tiramisu Onctueux',            'Un délicieux tiramisu à la crème onctueuse et au cacao.', 600,  './assets/images/menu/tiramisu_onctueux.jpg',  9),
  ('boissons',  'Mojito Rouge',                 'Boisson fraîche aux saveurs acidulées.',                  500,  './assets/images/menu/mojito_rouge.jpg',       10)
) as d (cat, name, description, price, photo, position)
join public.categories c on c.slug = d.cat
where not exists (select 1 from public.dishes);


-- =========================================
-- DERNIÈRE ÉTAPE : DÉSIGNER L'ADMINISTRATEUR
-- 1. Créez le compte dans Authentication > Users > Add user.
-- 2. Remplacez l'e-mail ci-dessous, décommentez et exécutez :
-- =========================================

-- insert into public.admins (user_id)
-- select id from auth.users where email = 'votre-email@exemple.com'
-- on conflict do nothing;
