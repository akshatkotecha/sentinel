-- Sentinel database schema. Run once in the Supabase SQL editor.

create table public.users (
  id text primary key,
  name text not null,
  role text,
  skills text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id bigint generated always as identity primary key,
  title text not null,
  required_skills text[] not null default '{}',
  type text not null default 'General',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assigned_to text references public.users (id) on delete set null,
  match_score numeric,
  deadline timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_assigned_to_idx on public.tasks (assigned_to);

create table public.behavior (
  user_id text primary key references public.users (id) on delete cascade,
  commits integer not null default 0,
  last_commit timestamptz,
  file_edits_total integer not null default 0,
  file_edits_reverts integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Stores the code summary, never the source.
create table public.submissions (
  id bigint generated always as identity primary key,
  user_name text not null,
  title text,
  final_score numeric not null,
  syntax_ok boolean,
  quality jsonb,
  summary jsonb,
  llm_result jsonb,
  source text,
  created_at timestamptz not null default now()
);
create index submissions_user_name_idx on public.submissions (user_name);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_name text not null,
  body text not null,
  type text,
  created_at timestamptz not null default now()
);

create table public.commitments (
  user_name text primary key,
  message text not null,
  created_at timestamptz not null default now()
);

-- Computed from submissions on each read, so it can't drift from the scores.
create view public.leaderboard with (security_invoker = true) as
  select user_name as "user", max(final_score) as score
  from public.submissions
  group by user_name
  order by max(final_score) desc;

-- RLS on with no policies: only the services holding the secret key get in.
alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.behavior enable row level security;
alter table public.submissions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.commitments enable row level security;
