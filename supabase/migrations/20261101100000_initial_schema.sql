create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  gender text not null check (gender in ('m', 'f')),
  age int not null check (age > 0 and age < 121),
  mode text not null check (mode in ('c', 'g')),
  equipment text[] not null default '{}',
  targets text[] not null,
  days_per_week int not null check (days_per_week between 2 and 7),
  slots text[] not null,
  start_date date not null,
  mood text not null default 'semangat',
  timezone text not null default 'Asia/Jakarta',
  ics_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.exercises (
  id text primary key,
  name text not null,
  name_en text not null,
  target text not null,
  mode text not null,
  equipment text not null default 'none',
  gender text not null default 'b' check (gender in ('b', 'm', 'f')),
  sets int not null,
  reps text not null,
  tips text not null,
  images text[] not null default '{}',
  video_id text,
  source text,
  license text,
  needs_review boolean not null default false
);

create table public.planned_sessions (
  user_id uuid not null references public.profiles on delete cascade,
  plan_date date not null,
  slot int not null check (slot >= 0),
  focus text not null,
  exercise_ids text[] not null,
  primary key (user_id, plan_date, slot)
);

create table public.session_logs (
  user_id uuid not null references public.profiles on delete cascade,
  plan_date date not null,
  slot int not null check (slot >= 0),
  exercise_id text not null references public.exercises (id),
  sets_done int not null default 0 check (sets_done >= 0),
  done_at timestamptz,
  primary key (user_id, plan_date, slot, exercise_id),
  foreign key (user_id, plan_date, slot)
    references public.planned_sessions (user_id, plan_date, slot)
    on delete cascade
);

create table public.penalty_payments (
  user_id uuid not null references public.profiles on delete cascade,
  plan_date date not null,
  slot int not null check (slot >= 0),
  paid_at timestamptz not null default now(),
  primary key (user_id, plan_date, slot)
);

create table public.push_subscriptions (
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text primary key,
  keys jsonb not null
);

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.session_logs enable row level security;
alter table public.penalty_payments enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own"
  on public.profiles for delete using (auth.uid() = id);

create policy "exercises_select_authenticated"
  on public.exercises for select to authenticated using (true);

create policy "planned_sessions_select_own"
  on public.planned_sessions for select using (auth.uid() = user_id);
create policy "planned_sessions_insert_own"
  on public.planned_sessions for insert with check (auth.uid() = user_id);
create policy "planned_sessions_update_own"
  on public.planned_sessions for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "planned_sessions_delete_own"
  on public.planned_sessions for delete using (auth.uid() = user_id);

create policy "session_logs_select_own"
  on public.session_logs for select using (auth.uid() = user_id);
create policy "session_logs_insert_own"
  on public.session_logs for insert with check (auth.uid() = user_id);
create policy "session_logs_update_own"
  on public.session_logs for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "session_logs_delete_own"
  on public.session_logs for delete using (auth.uid() = user_id);

create policy "penalty_payments_select_own"
  on public.penalty_payments for select using (auth.uid() = user_id);
create policy "penalty_payments_insert_own"
  on public.penalty_payments for insert with check (auth.uid() = user_id);
create policy "penalty_payments_update_own"
  on public.penalty_payments for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "penalty_payments_delete_own"
  on public.penalty_payments for delete using (auth.uid() = user_id);

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete using (auth.uid() = user_id);
