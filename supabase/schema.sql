-- Можно выполнить повторно: существующий прогресс не удаляется.
begin;
create table if not exists public.learning_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('known', 'lessons', 'lastQuiz')),
  item_id text not null check (length(item_id) between 1 and 4000),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id),
  constraint valid_progress_value check (
    (kind in ('known', 'lessons') and jsonb_typeof(value) = 'boolean')
    or (kind = 'lastQuiz' and item_id = 'latest' and jsonb_typeof(value) = 'object')
  )
);
alter table public.learning_progress enable row level security;
revoke all on public.learning_progress from anon;
grant select, insert, update on public.learning_progress to authenticated;

drop policy if exists "Read own progress" on public.learning_progress;
drop policy if exists "Insert own progress" on public.learning_progress;
drop policy if exists "Update own progress" on public.learning_progress;
create policy "Read own progress" on public.learning_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own progress" on public.learning_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own progress" on public.learning_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.touch_progress_timestamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists touch_learning_progress on public.learning_progress;
create trigger touch_learning_progress before update on public.learning_progress
for each row execute function public.touch_progress_timestamp();
notify pgrst, 'reload schema';
commit;
