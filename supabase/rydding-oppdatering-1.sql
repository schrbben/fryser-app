-- Oppdatering 1 av ryddingen: torsdag som ryddedag, og «tid i dag» som kan endres for én dag.
-- Kan trygt kjøres flere ganger, og ingenting slettes.
alter table chore_settings alter column cleaning_weekday set default 4;
alter table chore_settings add column if not exists cap_today int check (cap_today > 0); -- minutter i dag, null = vanlig tid
alter table chore_settings add column if not exists cap_today_on date;                  -- dagen cap_today gjelder for
update chore_settings set cleaning_weekday = 4 where id = 1 and cleaning_weekday = 0;
