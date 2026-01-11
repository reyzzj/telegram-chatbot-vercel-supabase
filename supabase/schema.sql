-- Supabase schema for Telegram Chatbot logging

create table if not exists public.users (
  telegram_user_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  chat_id bigint not null,
  direction text not null check (direction in ('in','out')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists message_logs_user_time_idx on public.message_logs (telegram_user_id, created_at desc);
create index if not exists message_logs_chat_time_idx on public.message_logs (chat_id, created_at desc);

alter table public.users enable row level security;
alter table public.message_logs enable row level security;
