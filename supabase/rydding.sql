-- Rydding: faste oppgaver i hjemmet, når de sist ble gjort og hva som skal gjøres på ryddedagen.
-- Kan trygt kjøres flere ganger. Fryser- og bod-tabellene blir ikke rørt.
-- Tabellene heter chore_* fordi fryseren allerede bruker navnet «rooms».
-- Frist, farge og forslag regnes ut i appen og lagres ikke.

create table if not exists chore_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_id uuid not null references chore_rooms(id) on delete restrict,
  interval_weeks int not null check (interval_weeks > 0),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  est_minutes int not null default 15 check (est_minutes > 0),        -- aktiv innsats i minutter
  fixed_months int[] check (                                         -- f.eks. {4,10} = april og oktober
    fixed_months is null
    or (cardinality(fixed_months) > 0 and fixed_months <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  ),
  purchase_item text,                                                -- null = ingen innkjøp
  purchase_done_for date,                                            -- fristen varen er kjøpt for
  notes text,
  snoozed_until date,                                                -- utsatt til denne ryddedagen
  initial_due date,                                                  -- startfrist før første gang er registrert
  archived boolean not null default false,                           -- arkivert, historikken beholdes
  created_at timestamptz not null default now()
);

create index if not exists chores_room_id_idx on chores(room_id);

create table if not exists chore_completions (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references chores(id) on delete cascade,
  done_on date not null default ((now() at time zone 'Europe/Oslo')::date), -- norsk dato, ikke UTC
  created_at timestamptz not null default now(),
  unique (chore_id, done_on)                                         -- ett «gjort» per oppgave per dag
);

create table if not exists chore_settings (
  id int primary key default 1 check (id = 1),                       -- bare én rad
  cleaning_weekday int not null default 0 check (cleaning_weekday between 0 and 6), -- 0 = søndag
  cap_minutes int not null default 105 check (cap_minutes > 0),
  notify_time time not null default '09:00'
);

insert into chore_settings (id) values (1) on conflict (id) do nothing;

-- Samme tilgang som fryseren og boden: alle med lenken kan lese og endre.
alter table chore_rooms enable row level security;
alter table chores enable row level security;
alter table chore_completions enable row level security;
alter table chore_settings enable row level security;

drop policy if exists "Alle kan lese og endre rom" on chore_rooms;
create policy "Alle kan lese og endre rom" on chore_rooms
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Alle kan lese og endre oppgaver" on chores;
create policy "Alle kan lese og endre oppgaver" on chores
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Alle kan lese og endre historikk" on chore_completions;
create policy "Alle kan lese og endre historikk" on chore_completions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Alle kan lese og endre innstillinger" on chore_settings;
create policy "Alle kan lese og endre innstillinger" on chore_settings
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on chore_rooms, chores, chore_completions, chore_settings to anon, authenticated;

-- Sanntidsoppdatering mellom mobilene
do $$ begin
  alter publication supabase_realtime add table chore_rooms;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table chores;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table chore_completions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table chore_settings;
exception when duplicate_object then null; end $$;

-- Startdata: 7 rom og 48 oppgaver (hoppes over hvis det allerede finnes rom).
-- Generert fra lib/ryddingSeed.json.
do $$
begin
  if exists (select 1 from chore_rooms) then
    raise notice 'Ryddingen har allerede rom, startdata hoppes over';
    return;
  end if;

  insert into chore_rooms (name, sort_order) values
    ('Kjøkken', 1),
    ('Bad', 2),
    ('Soverom', 3),
    ('Stue', 4),
    ('Gjesterom', 5),
    ('Entré', 6),
    ('Hele boligen', 7);

  insert into chores (room_id, name, interval_weeks, priority, est_minutes, fixed_months, purchase_item)
  select r.id, v.name, v.interval_weeks, v.priority, v.est_minutes, v.fixed_months::int[], v.purchase_item
  from (values
    ('Kjøkken', 'Vaske kjøkkenhåndklær og kluter', 1, 'high', 5, null, null),
    ('Kjøkken', 'Rydde kjøleskapet for gammel mat', 1, 'high', 10, null, null),
    ('Kjøkken', 'Rense kaffemaskinen', 4, 'medium', 10, null, 'Rensetabletter'),
    ('Kjøkken', 'Vaske søppelbøtter', 4, 'medium', 15, null, null),
    ('Kjøkken', 'Rense filter i oppvaskmaskinen', 8, 'medium', 10, null, null),
    ('Kjøkken', 'Tørke fronter og håndtak på kjøkkenskap', 8, 'low', 15, null, null),
    ('Kjøkken', 'Avkalke kaffemaskinen', 12, 'medium', 10, null, 'Avkalkingsmiddel'),
    ('Kjøkken', 'Bytte/vaske filtermatte i kjøkkenvifta', 12, 'medium', 10, null, 'Filtermatte'),
    ('Kjøkken', 'Vaske kjøleskapet innvendig', 12, 'medium', 30, null, null),
    ('Kjøkken', 'Gå gjennom fryseren', 12, 'low', 15, null, null),
    ('Kjøkken', 'Rengjøre stekeovnen', 12, 'medium', 45, null, null),
    ('Kjøkken', 'Rense vannlåsen under vasken', 26, 'low', 20, null, null),
    ('Kjøkken', 'Slipe kniver', 26, 'low', 15, null, null),
    ('Kjøkken', 'Vaske kjøkkenskap innvendig', 26, 'low', 60, null, null),
    ('Kjøkken', 'Avrime fryseren', 52, 'medium', 30, null, null),
    ('Kjøkken', 'Støvsuge bak kjøleskapet', 52, 'low', 15, null, null),
    ('Kjøkken', 'Vaske vegger og tak på kjøkkenet', 52, 'low', 60, null, null),
    ('Bad', 'Vaskemaskin: pakning, såpeskuff og tom 90°-vask', 4, 'medium', 15, null, null),
    ('Bad', 'Tørketrommel: skylle kondensator/filterblokk', 4, 'medium', 10, null, null),
    ('Bad', 'Vaske dusjen: vegger, spyle alt inkl. sluk', 8, 'medium', 30, null, null),
    ('Bad', 'Rense pumpefilteret på vaskemaskinen', 12, 'medium', 15, null, null),
    ('Bad', 'Bytte dobørste', 26, 'low', 2, null, 'Dobørste'),
    ('Bad', 'Se over silikonfugene', 52, 'low', 10, null, null),
    ('Bad', 'Vaske vegger og tak på badet', 52, 'low', 45, null, null),
    ('Soverom', 'Skifte sengetøy', 1, 'high', 15, null, null),
    ('Soverom', 'Tørke av nattbordene', 12, 'low', 5, null, null),
    ('Soverom', 'Vaske puter', 26, 'medium', 10, null, null),
    ('Soverom', 'Snu eller rotere madrassen', 26, 'low', 10, null, null),
    ('Soverom', 'Vaske boksene under senga', 26, 'low', 20, null, null),
    ('Soverom', 'Vaske dyner', 52, 'medium', 15, null, null),
    ('Soverom', 'Vaske klesskapene', 52, 'low', 45, null, null),
    ('Soverom', 'Vaske vegger og tak på soverommet', 52, 'low', 60, null, null),
    ('Stue', 'Vaske bokhyller og vitrineskap', 26, 'low', 45, null, null),
    ('Stue', 'Vaske putetrekkene på sofaen', 52, 'low', 15, null, null),
    ('Stue', 'Vaske vegger og tak i stua', 52, 'low', 60, null, null),
    ('Gjesterom', 'Tørke støv og lufte gjesterommet', 12, 'low', 10, null, null),
    ('Gjesterom', 'Vaske vegger og tak på gjesterommet', 52, 'low', 45, null, null),
    ('Entré', 'Riste eller vaske dørmatta', 4, 'low', 5, null, null),
    ('Entré', 'Rydde og vaske skohylla og yttertøyet', 12, 'low', 20, null, null),
    ('Entré', 'Vaske vegger og tak i entréen', 52, 'low', 30, null, null),
    ('Hele boligen', 'Rense robotstøvsugeren', 4, 'medium', 10, null, null),
    ('Hele boligen', 'Moppe gulvene', 4, 'medium', 45, null, null),
    ('Hele boligen', 'Tørke støv av ventiler', 12, 'medium', 10, null, null),
    ('Hele boligen', 'Vaske lister', 12, 'low', 45, null, null),
    ('Hele boligen', 'Vaske vinduer', 26, 'low', 60, array[4, 10], null),
    ('Hele boligen', 'Bytte filteret i hovedvifta', 26, 'medium', 10, null, 'Ventilasjonsfilter'),
    ('Hele boligen', 'Bytte batteri i røykvarslerne', 52, 'high', 10, array[12], 'Batterier'),
    ('Hele boligen', 'Vaske gardiner', 52, 'low', 20, null, null)
  ) as v(room, name, interval_weeks, priority, est_minutes, fixed_months, purchase_item)
  join chore_rooms r on r.name = v.room;
end $$;
