-- Live updates: the change register goes into Supabase Realtime's publication, so each new row reaches the apps of the
-- people who may read it (the changes_visible policy decides, as for changesSince). The app still polls: an engine
-- without Realtime, or a nudge lost, is caught at the next interval.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'changes') then
    alter publication supabase_realtime add table public.changes;
  end if;
end $$;
