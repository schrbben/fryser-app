-- Oppdatering 2 av boden: loftsboden som egen etasje.
-- Kjør hele filen i Supabase → SQL Editor. Den kan trygt kjøres flere ganger, og ingenting slettes.
-- Alt som finnes fra før havner i kjellerboden.

alter table storage_boxes add column if not exists room text not null default 'kjeller';
alter table storage_boxes drop constraint if exists storage_boxes_room_check;
alter table storage_boxes add constraint storage_boxes_room_check check (room in ('kjeller', 'loft'));
