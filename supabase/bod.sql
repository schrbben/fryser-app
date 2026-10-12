-- Boden: bokser, kofferter og annet i boden, og hva som ligger i dem.
-- Kjør hele filen i Supabase → SQL Editor. Den kan trygt kjøres flere ganger.
-- Fryser-tabellene (rooms, items, history) blir ikke rørt.

create table if not exists storage_boxes (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'box' check (kind in ('box', 'bin', 'suitcase', 'cardboard', 'loose')),
  number int unique,                                   -- nummeret på lappen (plastboksene)
  label text not null default '',
  color text not null default 'clear',
  placement text not null default 'shelf' check (placement in ('shelf', 'floor', 'elsewhere')),
  shelf text check (shelf in ('A', 'B')),              -- A = innerst, B = høyre vegg
  level int check (level between 1 and 3),             -- 1 = nederst, 3 = øverst
  slot int check (slot between 1 and 4),               -- 1 = lengst til venstre
  pos_x real,                                          -- plass på gulvet, meter fra venstre vegg
  pos_z real,                                          -- plass på gulvet, meter fra innerste vegg
  rotation real not null default 0,                    -- grader
  location text not null default '',                   -- hvor den står hvis den ikke er i boden
  created_at timestamptz not null default now()
);

create table if not exists storage_items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references storage_boxes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists storage_items_box_id_idx on storage_items(box_id);

-- Samme tilgang som fryseren: alle med lenken kan lese og endre.
alter table storage_boxes enable row level security;
alter table storage_items enable row level security;

drop policy if exists "Alle kan lese og endre bokser" on storage_boxes;
create policy "Alle kan lese og endre bokser" on storage_boxes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Alle kan lese og endre innhold" on storage_items;
create policy "Alle kan lese og endre innhold" on storage_items
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on storage_boxes, storage_items to anon, authenticated;

-- Sanntidsoppdatering mellom mobilene
do $$ begin
  alter publication supabase_realtime add table storage_boxes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table storage_items;
exception when duplicate_object then null; end $$;

-- Startdata fra listene (hoppes over hvis boden allerede har innhold)
do $$
begin
  if exists (select 1 from storage_boxes) then
    raise notice 'Boden har allerede innhold, startdata hoppes over';
    return;
  end if;

  insert into storage_boxes (id, kind, number, label, color, placement, shelf, level, slot, pos_x, pos_z, rotation, location) values
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'box', 1, 'Servise + div', 'clear', 'shelf', 'A', 3, 1, null, null, 0, ''),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'box', 2, 'Drikkeflasker + kjøkkenutstyr', 'clear', 'shelf', 'A', 3, 2, null, null, 0, ''),
    ('f4aac5e7-0dd2-4f7c-a461-36ba8c422d5e', 'box', 3, '', 'clear', 'shelf', 'A', 3, 3, null, null, 0, ''),
    ('50c1736c-7409-4fe6-aa21-85e5f5780ff4', 'box', 4, '', 'clear', 'shelf', 'A', 3, 4, null, null, 0, ''),
    ('0a25322d-c011-4b2c-83f2-eab32c430974', 'box', 5, '', 'clear', 'shelf', 'A', 2, 1, null, null, 0, ''),
    ('317c77cc-7db4-457b-82f6-91f63bd91c6c', 'box', 6, '', 'clear', 'shelf', 'A', 2, 2, null, null, 0, ''),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'box', 7, '', 'clear', 'shelf', 'A', 2, 3, null, null, 0, ''),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'box', 8, '', 'clear', 'shelf', 'A', 2, 4, null, null, 0, ''),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'box', 9, '', 'clear', 'shelf', 'A', 1, 1, null, null, 0, ''),
    ('905182cd-7327-4346-b64b-27392246cfad', 'box', 10, '', 'clear', 'shelf', 'A', 1, 2, null, null, 0, ''),
    ('5eaa1d43-7573-4a30-8134-60f1ea71a59c', 'box', 11, 'Uten lapp', 'clear', 'shelf', 'A', 1, 3, null, null, 0, ''),
    ('43e69d0b-eef0-40ed-8ac6-9c2e39ef5f14', 'box', 12, '', 'clear', 'shelf', 'A', 1, 4, null, null, 0, ''),
    ('9063098c-b754-4110-b8d4-d413efa7a5e9', 'box', 13, 'Hvit avlang', 'white', 'shelf', 'B', 3, 1, null, null, 0, ''),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'box', 14, '', 'clear', 'shelf', 'B', 3, 2, null, null, 0, ''),
    ('42173a3d-b3df-45f9-9590-c2117e146b1c', 'box', 15, '', 'clear', 'shelf', 'B', 3, 3, null, null, 0, ''),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'box', 16, '', 'clear', 'shelf', 'B', 3, 4, null, null, 0, ''),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'box', 17, '', 'clear', 'shelf', 'B', 2, 1, null, null, 0, ''),
    ('1a8bfe2e-289f-48e4-82ae-8db0bcc608e0', 'suitcase', null, 'Samsonite koffert', 'black', 'floor', null, null, null, 0.32, 1.85, 90, ''),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'cardboard', null, 'Pappboks', 'brown', 'floor', null, null, null, 0.3, 2.55, 0, ''),
    ('51cf62cd-6273-42d0-bcaf-58eefb5c5f67', 'bin', null, 'Plastboks (lilla, blå, oransje)', 'purple', 'elsewhere', null, null, null, null, null, 0, 'Lille soverom');

  insert into storage_items (box_id, name, created_at) values
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'Kaffiservise (hvitt med gullkant) x10', now() + interval '1 millisecond' * 1),
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'Ølglass x4', now() + interval '1 millisecond' * 2),
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'Grønn kopp', now() + interval '1 millisecond' * 3),
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'Blomstervase lyseblå', now() + interval '1 millisecond' * 4),
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'Kubbelysholder brun', now() + interval '1 millisecond' * 5),
    ('1920db24-c61f-443f-a8b4-9a805896ed27', 'Brunt frokostservise med kopper', now() + interval '1 millisecond' * 6),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Drikkeflasker x3', now() + interval '1 millisecond' * 7),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Termos x4', now() + interval '1 millisecond' * 8),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Sugerør', now() + interval '1 millisecond' * 9),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Tuborg-glass', now() + interval '1 millisecond' * 10),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Stavmikser med tilbehør', now() + interval '1 millisecond' * 11),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Bordbrikker blå x5', now() + interval '1 millisecond' * 12),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Toastjern', now() + interval '1 millisecond' * 13),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Servietter x2', now() + interval '1 millisecond' * 14),
    ('7f0749af-772c-401d-87f0-d3fa5f2ef770', 'Kaffi fra Italia', now() + interval '1 millisecond' * 15),
    ('f4aac5e7-0dd2-4f7c-a461-36ba8c422d5e', 'Varmeteppe', now() + interval '1 millisecond' * 16),
    ('f4aac5e7-0dd2-4f7c-a461-36ba8c422d5e', 'Middagstallerkener x4', now() + interval '1 millisecond' * 17),
    ('f4aac5e7-0dd2-4f7c-a461-36ba8c422d5e', 'Pensumbøker sykepleien', now() + interval '1 millisecond' * 18),
    ('f4aac5e7-0dd2-4f7c-a461-36ba8c422d5e', 'Varmeflaske', now() + interval '1 millisecond' * 19),
    ('50c1736c-7409-4fe6-aa21-85e5f5780ff4', 'Sovepose x2', now() + interval '1 millisecond' * 20),
    ('50c1736c-7409-4fe6-aa21-85e5f5780ff4', 'Liggeunderlag x2', now() + interval '1 millisecond' * 21),
    ('50c1736c-7409-4fe6-aa21-85e5f5780ff4', 'Tursekk', now() + interval '1 millisecond' * 22),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Bryllupskort', now() + interval '1 millisecond' * 23),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Gaveposer', now() + interval '1 millisecond' * 24),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Stjerneskudd', now() + interval '1 millisecond' * 25),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Discgolf starter kit', now() + interval '1 millisecond' * 26),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Keramikkskål oransje', now() + interval '1 millisecond' * 27),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Hvit kopp x2', now() + interval '1 millisecond' * 28),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Blå skål', now() + interval '1 millisecond' * 29),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Blå skjellskål', now() + interval '1 millisecond' * 30),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Glassbolle', now() + interval '1 millisecond' * 31),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Whiskeyglass x4', now() + interval '1 millisecond' * 32),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Drikkeglass x4', now() + interval '1 millisecond' * 33),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Blå skål x2', now() + interval '1 millisecond' * 34),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Brødkniv', now() + interval '1 millisecond' * 35),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Kjøkkenredskaper (kniv x2, visp, pastasleiv, tresleiv, pizzahjul, stekespade)', now() + interval '1 millisecond' * 36),
    ('f5714dc6-2f8b-4bf2-956e-05b2d388d03b', 'Gul og blå bolle (Antonie, Sør-Afrika)', now() + interval '1 millisecond' * 37),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Hvite håndklær x5', now() + interval '1 millisecond' * 38),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Klut x2', now() + interval '1 millisecond' * 39),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Sjakkhåndkle x3 (gave)', now() + interval '1 millisecond' * 40),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Beige håndkle x2 (gave)', now() + interval '1 millisecond' * 41),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Beige håndkle', now() + interval '1 millisecond' * 42),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Blått håndkle', now() + interval '1 millisecond' * 43),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Beige laken', now() + interval '1 millisecond' * 44),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Grønt blomsterdynetrekk', now() + interval '1 millisecond' * 45),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Blått blomsterdynetrekk', now() + interval '1 millisecond' * 46),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Grønt blomsterputetrekk', now() + interval '1 millisecond' * 47),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Blått blomsterputetrekk', now() + interval '1 millisecond' * 48),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Poser til sengetøy x6', now() + interval '1 millisecond' * 49),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Hvitt putetrekk x2', now() + interval '1 millisecond' * 50),
    ('4ae1da30-a033-4413-b5c8-8b66d0fc36b2', 'Hvitt dynetrekk x2', now() + interval '1 millisecond' * 51),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'Ninja Creami', now() + interval '1 millisecond' * 52),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'Smoothiemaskin', now() + interval '1 millisecond' * 53),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'Hvitvinssaus glass', now() + interval '1 millisecond' * 54),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'Lysestake (kan gis i gave)', now() + interval '1 millisecond' * 55),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'Hengekøye', now() + interval '1 millisecond' * 56),
    ('f1cdf795-fbb5-4828-8ed3-d9f699c60c4a', 'Telt', now() + interval '1 millisecond' * 57),
    ('905182cd-7327-4346-b64b-27392246cfad', 'Hardanger bestikk x2', now() + interval '1 millisecond' * 58),
    ('905182cd-7327-4346-b64b-27392246cfad', 'Plantepinner + tråd (for å stramme opp)', now() + interval '1 millisecond' * 59),
    ('905182cd-7327-4346-b64b-27392246cfad', 'Hardanger bestikk fruktkniver', now() + interval '1 millisecond' * 60),
    ('905182cd-7327-4346-b64b-27392246cfad', 'Posterrull x2', now() + interval '1 millisecond' * 61),
    ('905182cd-7327-4346-b64b-27392246cfad', 'Hvitvinsglass / vinglass x6', now() + interval '1 millisecond' * 62),
    ('905182cd-7327-4346-b64b-27392246cfad', 'Crepepapir', now() + interval '1 millisecond' * 63),
    ('5eaa1d43-7573-4a30-8134-60f1ea71a59c', 'Bøker', now() + interval '1 millisecond' * 64),
    ('5eaa1d43-7573-4a30-8134-60f1ea71a59c', 'Julepynt', now() + interval '1 millisecond' * 65),
    ('43e69d0b-eef0-40ed-8ac6-9c2e39ef5f14', 'Klær til salgs', now() + interval '1 millisecond' * 66),
    ('43e69d0b-eef0-40ed-8ac6-9c2e39ef5f14', 'Babyklær', now() + interval '1 millisecond' * 67),
    ('43e69d0b-eef0-40ed-8ac6-9c2e39ef5f14', 'Aloha hawaiibånd x2', now() + interval '1 millisecond' * 68),
    ('9063098c-b754-4110-b8d4-d413efa7a5e9', 'Klær som skal selges', now() + interval '1 millisecond' * 69),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Barndomsting', now() + interval '1 millisecond' * 70),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Parykker', now() + interval '1 millisecond' * 71),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Hjerte-lunge-redning', now() + interval '1 millisecond' * 72),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Bandana', now() + interval '1 millisecond' * 73),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Bilder fra utdrikningslag', now() + interval '1 millisecond' * 74),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Hest fra utdrikningslag', now() + interval '1 millisecond' * 75),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Strikketøy', now() + interval '1 millisecond' * 76),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Sokk til Emma', now() + interval '1 millisecond' * 77),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Genser til pappa', now() + interval '1 millisecond' * 78),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Målebånd', now() + interval '1 millisecond' * 79),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Blått papir / hobbypapir', now() + interval '1 millisecond' * 80),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Ballonger', now() + interval '1 millisecond' * 81),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Glassvaser fra bryllupet x5', now() + interval '1 millisecond' * 82),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Julekrybbe', now() + interval '1 millisecond' * 83),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Sydenvifte', now() + interval '1 millisecond' * 84),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Gul feber vaksinemotstander', now() + interval '1 millisecond' * 85),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'STORYTIME fra Tanzania', now() + interval '1 millisecond' * 86),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'CD-spiller Watoto', now() + interval '1 millisecond' * 87),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Årbok Smiodden', now() + interval '1 millisecond' * 88),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Russehettegenser', now() + interval '1 millisecond' * 89),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Russedress', now() + interval '1 millisecond' * 90),
    ('bc415dfa-4a00-4e35-8969-52ec1ab1172d', 'Hola hola Hawaii', now() + interval '1 millisecond' * 91),
    ('42173a3d-b3df-45f9-9590-c2117e146b1c', 'Fretex-ting', now() + interval '1 millisecond' * 92),
    ('42173a3d-b3df-45f9-9590-c2117e146b1c', 'Lyseblå tallerken fra mams og paps', now() + interval '1 millisecond' * 93),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Sommerklær', now() + interval '1 millisecond' * 94),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Bergans turjakke rosa', now() + interval '1 millisecond' * 95),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Sett fra Karen', now() + interval '1 millisecond' * 96),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Grønn turbukse', now() + interval '1 millisecond' * 97),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Swix-jakke', now() + interval '1 millisecond' * 98),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Offwhite strikkegenser', now() + interval '1 millisecond' * 99),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Brun vest fra farmor', now() + interval '1 millisecond' * 100),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Velur-dressjakker fra Erle x2', now() + interval '1 millisecond' * 101),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Skinnhansker', now() + interval '1 millisecond' * 102),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Armani dressjakke x2', now() + interval '1 millisecond' * 103),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Bryllupskjole med farger', now() + interval '1 millisecond' * 104),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Rød juleduk', now() + interval '1 millisecond' * 105),
    ('afd697d2-0740-4d3e-9e51-1a45251b4303', 'Strikkeutstyr: prosjekt grønn og hvit genser', now() + interval '1 millisecond' * 106),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'Barndomsting', now() + interval '1 millisecond' * 107),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'Day bag: GÅ GJENNOM', now() + interval '1 millisecond' * 108),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'Angstbok og perm', now() + interval '1 millisecond' * 109),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'Rødt regntøy', now() + interval '1 millisecond' * 110),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'Sommerklær', now() + interval '1 millisecond' * 111),
    ('8f4750fc-0f62-4252-a0a2-6c1ad5eb550e', 'Russegenser', now() + interval '1 millisecond' * 112),
    ('1a8bfe2e-289f-48e4-82ae-8db0bcc608e0', 'Hest', now() + interval '1 millisecond' * 113),
    ('1a8bfe2e-289f-48e4-82ae-8db0bcc608e0', 'Tøymykner', now() + interval '1 millisecond' * 114),
    ('1a8bfe2e-289f-48e4-82ae-8db0bcc608e0', 'Vaskemiddel', now() + interval '1 millisecond' * 115),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'Servise fra mormor', now() + interval '1 millisecond' * 116),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'Tallerken', now() + interval '1 millisecond' * 117),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'Skål', now() + interval '1 millisecond' * 118),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'Kopp', now() + interval '1 millisecond' * 119),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'Gammel spotlampe', now() + interval '1 millisecond' * 120),
    ('3609bfd0-378b-430d-a7c5-781e2e01307b', 'Gaffateip', now() + interval '1 millisecond' * 121),
    ('51cf62cd-6273-42d0-bcaf-58eefb5c5f67', 'Perler til perling av smykker', now() + interval '1 millisecond' * 122),
    ('51cf62cd-6273-42d0-bcaf-58eefb5c5f67', 'Maleutstyr', now() + interval '1 millisecond' * 123),
    ('51cf62cd-6273-42d0-bcaf-58eefb5c5f67', 'Maling', now() + interval '1 millisecond' * 124);
end $$;
