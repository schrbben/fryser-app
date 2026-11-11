-- Oppdatering 2 av ryddingen: varsel om morgenen på ryddedagen.
-- Kan trygt kjøres flere ganger, og ingenting slettes.

-- Én rad per telefon som har slått på varsler
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,   -- adressen varselet sendes til
  keys jsonb not null,             -- krypteringsnøklene fra telefonen (p256dh og auth)
  device text,                     -- f.eks. «iPhone», bare for å kjenne dem igjen
  created_at timestamptz not null default now(),
  last_sent_at timestamptz         -- sist et varsel kom fram
);

-- Samme åpne tilgang som resten av appen
alter table push_subscriptions enable row level security;
drop policy if exists "Alle kan lese og endre varselabonnement" on push_subscriptions;
create policy "Alle kan lese og endre varselabonnement" on push_subscriptions
  for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on push_subscriptions to anon, authenticated;

-- Hvilken dag morgenvarselet sist ble sendt, så det bare sendes én gang
alter table chore_settings add column if not exists notify_sent_on date;

-- Databasen vekker varselsiden hvert kvarter. Siden sender bare når det er ryddedag,
-- klokka har passert varseltidspunktet og dagens varsel ikke er sendt.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'rydding-varsel';
select cron.schedule(
  'rydding-varsel',
  '*/15 * * * *',
  $$ select net.http_get(url := 'https://fryser-app.vercel.app/api/rydding/varsel', timeout_milliseconds := 15000) $$
);
