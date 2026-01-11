-- Minimal Supabase schema for Telegram duty bot
-- Stores ONLY users (no message logs)

-- Optional cleanup (uncomment if you previously created message_logs)
-- drop table if exists public.message_logs;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'commander', 'trooper');
  end if;
end $$;

create table if not exists public.users (
  telegram_user_id bigint primary key,
  role public.user_role not null default 'trooper',
  full_name text not null,
  company text not null,
  platoon text not null,

  -- optional identity fields from Telegram
  username text,
  first_name text,
  last_name text,

  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_company_platoon_idx on public.users (company, platoon);

-- If you enable RLS, you'll need policies.
-- For server-side usage with the Service Role key, you can keep RLS disabled for simplicity.
