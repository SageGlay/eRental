-- eRental foundation: profiles, admin_users, categories, listings, listing_photos, photo storage.
-- Already applied to the Supabase project "eRental" (Singapore) on 2026-11-02.
-- Keep this file in supabase/migrations/ as the record of how the database was built.

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===== Tables =====
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  account_type text not null default 'individual' check (account_type in ('individual', 'business')),
  business_name text check (char_length(business_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_type = 'business' or business_name is null)
);

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null unique,
  sort_order smallint not null default 0
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  category_id smallint not null references public.categories (id),
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  price numeric(12,2) not null check (price >= 0),
  price_period text not null default 'day' check (price_period in ('hour', 'day', 'week', 'month', 'year')),
  deposit numeric(12,2) check (deposit >= 0),
  location_text text not null check (char_length(trim(location_text)) between 2 and 160),
  terms text check (char_length(terms) <= 3000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'available' check (status in ('available', 'unavailable', 'removed')),
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(location_text, ''))
  ) stored
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index listings_search_idx on public.listings using gin (search);
create index listings_category_idx on public.listings (category_id);
create index listings_owner_idx on public.listings (owner_id);
create index listings_status_created_idx on public.listings (status, created_at desc);
create index listings_price_idx on public.listings (price);
create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);

-- ===== Functions and triggers =====
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New user'
    ), 80)
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

create or replace function public.enforce_photo_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.listing_photos where listing_id = new.listing_id) >= 10 then
    raise exception 'A listing can have at most 10 photos';
  end if;
  return new;
end;
$$;
create trigger listing_photos_limit before insert on public.listing_photos
  for each row execute function public.enforce_photo_limit();

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_photo_limit() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ===== Table privileges (RLS below narrows these further) =====
revoke all on public.profiles, public.admin_users, public.categories, public.listings, public.listing_photos
  from anon, authenticated;
grant select on public.profiles, public.categories, public.listings, public.listing_photos to anon, authenticated;
grant update (display_name, avatar_url, account_type, business_name) on public.profiles to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update on public.listings to authenticated;
grant insert, update, delete on public.listing_photos to authenticated;

-- ===== Row Level Security =====
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;

-- admin_users: no policies on purpose. Nobody can read or change it through the API.

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "categories are public" on public.categories
  for select to anon, authenticated using (true);
create policy "admins insert categories" on public.categories
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update categories" on public.categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete categories" on public.categories
  for delete to authenticated using ((select public.is_admin()));

create policy "visible listings are public" on public.listings
  for select to anon, authenticated using (status <> 'removed');
create policy "owners and admins see all their listings" on public.listings
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "owners create own listings" on public.listings
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and not removed_by_admin);
create policy "owners update own listings" on public.listings
  for update to authenticated
  using (owner_id = (select auth.uid()) and not removed_by_admin)
  with check (owner_id = (select auth.uid()) and not removed_by_admin);
create policy "admins update any listing" on public.listings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "photos of visible listings are public" on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.status <> 'removed'));
create policy "owners and admins see their photos" on public.listing_photos
  for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy "owners add photos to own listings" on public.listing_photos
  for insert to authenticated
  with check (
    split_part(storage_path, '/', 1) = (select auth.uid())::text
    and exists (select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid()) and not l.removed_by_admin));
create policy "owners update photos of own listings" on public.listing_photos
  for update to authenticated
  using (exists (select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid()) and not l.removed_by_admin))
  with check (
    split_part(storage_path, '/', 1) = (select auth.uid())::text
    and exists (select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid()) and not l.removed_by_admin));
create policy "owners delete photos of own listings" on public.listing_photos
  for delete to authenticated
  using (exists (select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid()) and not l.removed_by_admin));

-- ===== Seed: the ten approved categories =====
insert into public.categories (slug, name, sort_order) values
  ('vehicles-transportation', 'Vehicles and Transportation', 1),
  ('residential-properties', 'Residential Properties and Accommodation', 2),
  ('commercial-properties', 'Commercial Properties and Business Spaces', 3),
  ('land-lots', 'Land and Lots', 4),
  ('tools-machinery-equipment', 'Tools, Machinery, and Construction Equipment', 5),
  ('electronics-gadgets', 'Electronics and Gadgets', 6),
  ('events-parties-recreation', 'Events, Parties, and Recreation', 7),
  ('furniture-household', 'Furniture and Household Equipment', 8),
  ('clothing-special-occasion', 'Clothing and Special Occasion Items', 9),
  ('other', 'Other Rental Categories', 10);

-- ===== Storage: listing photos (public viewing, uploads only into your own folder) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "listing photos: see own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing photos: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing photos: update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing photos: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
