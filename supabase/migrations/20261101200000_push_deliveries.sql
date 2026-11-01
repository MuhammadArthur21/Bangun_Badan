alter table public.profiles
  add column email_reminders boolean not null default false;

create table public.push_deliveries (
  user_id uuid not null references public.profiles on delete cascade,
  plan_date date not null,
  slot int not null check (slot >= 0),
  channel text not null check (channel in ('push', 'email')),
  sent_at timestamptz not null default now(),
  primary key (user_id, plan_date, slot, channel)
);

alter table public.push_deliveries enable row level security;
