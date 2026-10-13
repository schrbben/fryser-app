-- Oppdatering 1 av boden: lave bokser, toppen av hyllene og stabling.
-- Kjør hele filen i Supabase → SQL Editor. Den kan trygt kjøres flere ganger, og ingenting slettes.

-- Størrelse på plastboksene: vanlig, lav eller lav og lang (tar to plasser)
alter table storage_boxes add column if not exists size text not null default 'normal';
alter table storage_boxes drop constraint if exists storage_boxes_size_check;
alter table storage_boxes add constraint storage_boxes_size_check check (size in ('normal', 'low', 'long'));

-- Boksen den står oppå. Blir den andre boksen slettet, blir feltet tomt.
alter table storage_boxes add column if not exists stack_on uuid references storage_boxes(id) on delete set null;

-- Ny plassering «stacked» (står oppå en annen boks)
alter table storage_boxes drop constraint if exists storage_boxes_placement_check;
alter table storage_boxes add constraint storage_boxes_placement_check
  check (placement in ('shelf', 'floor', 'elsewhere', 'stacked'));

-- Etasje 4 = oppå øverste hylleplate
alter table storage_boxes drop constraint if exists storage_boxes_level_check;
alter table storage_boxes add constraint storage_boxes_level_check check (level between 1 and 4);
