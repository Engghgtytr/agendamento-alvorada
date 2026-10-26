-- Agendamento da Barbearia Alvorada: tabelas, regras, permissões (RLS) e funções.
-- Rode no SQL Editor do Supabase (ou com `supabase db push`). Depois rode 002 e 003.
--
-- Quem pode o quê:
--   visitante (anon):        lê a loja, os serviços, a equipe e o expediente.
--                            NÃO lê a tabela de agendamentos. Vê só os horários livres
--                            (função available_slots) e marca pela função book_appointment.
--   quem tem o código:       vê e cancela o próprio horário (get_booking / cancel_booking).
--   admin (tabela admins):   vê a agenda, muda o status, bloqueia horários e edita tudo.
-- Ninguém vira admin pelo site: a linha em `admins` só é criada pelo SQL Editor.

-- A trava contra horário sobreposto precisa desta extensão (comparar texto com "=" num índice GiST).
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------- Tabelas ----------

create table public.shop_settings (
  id                   smallint primary key default 1 check (id = 1), -- uma barbearia só
  name                 text not null check (char_length(name) between 1 and 60),
  -- 55 + DDD + número, só dígitos. Vazio (null) = barbearia fictícia, sem WhatsApp.
  whatsapp             text check (whatsapp ~ '^55[0-9]{10,11}$'),
  timezone             text not null default 'America/Sao_Paulo',
  slot_step_min        integer not null default 15 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  min_notice_min       integer not null default 60 check (min_notice_min between 0 and 10080),
  window_days          integer not null default 21 check (window_days between 1 and 90),
  cancel_limit_min     integer not null default 120 check (cancel_limit_min between 0 and 10080),
  max_active_per_phone integer not null default 2 check (max_active_per_phone between 1 and 10)
);

create table public.services (
  id           text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name         text not null check (char_length(name) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 200),
  duration_min integer not null check (duration_min between 5 and 480 and duration_min % 5 = 0),
  price_cents  integer not null check (price_cents between 0 and 1000000),
  active       boolean not null default true,
  position     integer not null default 0
);

create table public.barbers (
  id        text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name      text not null check (char_length(name) between 1 and 40),
  specialty text not null default '' check (char_length(specialty) <= 80),
  active    boolean not null default true,
  position  integer not null default 0
);

-- Expediente: duas linhas no mesmo dia = intervalo de almoço no meio. 0 = domingo.
create table public.working_hours (
  id         bigint generated always as identity primary key,
  barber_id  text not null references public.barbers (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (start_time < end_time)
);

create index working_hours_barber_idx on public.working_hours (barber_id, weekday);

-- Bloqueios do dono: almoço fora do padrão, folga, médico, feriado.
create table public.time_off (
  id        bigint generated always as identity primary key,
  barber_id text not null references public.barbers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text not null default '' check (char_length(reason) <= 100),
  check (starts_at < ends_at)
);

create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  barber_id         text not null references public.barbers (id),
  service_id        text references public.services (id) on delete set null,
  -- Copiados na hora de marcar: se o preço mudar depois, o histórico não muda.
  service_name      text not null,
  duration_min      integer not null,
  price_cents       integer not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- Ficam vazios depois de 30 dias (LGPD): ver anonymize_old_appointments.
  customer_name     text check (char_length(customer_name) between 2 and 60),
  customer_phone    text check (customer_phone ~ '^55[0-9]{10,11}$'),
  status            text not null default 'booked' check (status in ('booked', 'done', 'no_show', 'cancelled')),
  -- Só o HASH do código do link "meu horário". O código em si não fica guardado,
  -- como uma senha: quem vê o banco não consegue montar o link.
  cancel_token_hash bytea not null unique,
  created_at        timestamptz not null default now(),
  anonymized_at     timestamptz,
  check (starts_at < ends_at),

  -- A GARANTIA contra horário duplicado: dois agendamentos marcados do mesmo barbeiro
  -- não podem ter horários que se sobrepõem. '[)' = o fim não conta, então 14:00–14:40
  -- e 14:40–15:10 convivem. Quem cuida disso é o PostgreSQL, não o site.
  constraint appointments_no_overlap exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'booked')
);

create index appointments_phone_idx on public.appointments (customer_phone) where status = 'booked';
create index appointments_created_idx on public.appointments (created_at);

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Quem é admin ----------

-- security definer: lê a tabela admins mesmo sem permissão direta sobre ela.
-- search_path vazio impede que alguém "troque" uma tabela por outra com o mesmo nome.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------- Horários livres ----------

-- Mesma regra de src/utils/slots.js (e há um teste que confere que as duas dão o mesmo
-- resultado): o atendimento inteiro cabe no expediente, anda na grade a partir do
-- início da faixa, não encosta em agendamento nem bloqueio, respeita a antecedência
-- mínima e a janela de dias. Devolve só horários: nenhum nome, nenhum telefone.
create or replace function public.available_slots(p_date date, p_service_id text, p_barber_id text default null)
returns table (slot_time text, starts_at timestamptz, ends_at timestamptz, barber_ids text[])
language sql
stable
security definer
set search_path = ''
as $$
  with grid as (
    select c.id as barber_id,
           c.position,
           g.local_ts,
           g.local_ts at time zone shop.timezone as starts_at,
           (g.local_ts at time zone shop.timezone) + make_interval(mins => svc.duration_min) as ends_at,
           shop.min_notice_min
    from public.shop_settings shop
    cross join (select duration_min from public.services where id = p_service_id and active) svc
    cross join (select (now() at time zone timezone)::date as d from public.shop_settings) today
    cross join (select id, position from public.barbers where active and (p_barber_id is null or id = p_barber_id)) c
    join public.working_hours wh on wh.barber_id = c.id and wh.weekday = extract(dow from p_date)
    cross join lateral generate_series(
      p_date + wh.start_time,
      p_date + wh.end_time - make_interval(mins => svc.duration_min),
      make_interval(mins => shop.slot_step_min)
    ) as g(local_ts)
    where p_date between today.d and today.d + shop.window_days - 1
  )
  select to_char(g.local_ts, 'HH24:MI'),
         min(g.starts_at),
         min(g.ends_at),
         array_agg(g.barber_id order by g.position, g.barber_id)
  from grid g
  where g.starts_at >= now() + make_interval(mins => g.min_notice_min)
    and not exists (
      select 1 from public.appointments a
      where a.barber_id = g.barber_id
        and a.status = 'booked'
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(g.starts_at, g.ends_at, '[)')
    )
    and not exists (
      select 1 from public.time_off t
      where t.barber_id = g.barber_id
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(g.starts_at, g.ends_at, '[)')
    )
  group by g.local_ts
  order by g.local_ts
$$;

-- ---------- Marcar ----------

-- A única porta de entrada para criar agendamento (não há permissão de INSERT na tabela).
-- Erros voltam com uma palavra-chave na mensagem (slot_taken, limit, busy, invalid)
-- e o texto para mostrar à pessoa no "hint".
create or replace function public.book_appointment(
  p_date date,
  p_time text,
  p_service_id text,
  p_barber_id text,
  p_name text,
  p_phone text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop    public.shop_settings;
  v_service public.services;
  v_slot    record;
  v_barber  text;
  v_name    text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code    text;
begin
  select * into v_shop from public.shop_settings limit 1;
  select * into v_service from public.services where id = p_service_id and active;
  if v_service.id is null then
    raise exception 'invalid' using hint = 'Escolha o serviço de novo.';
  end if;
  if p_barber_id is not null and not exists (select 1 from public.barbers where id = p_barber_id and active) then
    raise exception 'invalid' using hint = 'Escolha o barbeiro de novo.';
  end if;
  if char_length(v_name) not between 2 and 60 or v_name !~ '[[:alpha:]]' then
    raise exception 'invalid' using hint = 'Confira o seu nome.';
  end if;
  if coalesce(p_phone, '') !~ '^55[0-9]{10,11}$' then
    raise exception 'invalid' using hint = 'Confira o seu WhatsApp.';
  end if;
  if coalesce(p_time, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid' using hint = 'Escolha o horário de novo.';
  end if;

  -- Fila: dois pedidos ao mesmo tempo esperam um o outro aqui, até o fim da transação.
  -- Assim a conferência "está livre?" e a gravação acontecem sem ninguém no meio.
  perform pg_advisory_xact_lock(hashtext('alvorada:book'));

  -- Freio contra robô: muitos agendamentos no último minuto, em toda a barbearia.
  if (select count(*) from public.appointments where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'busy' using hint = 'Muitos agendamentos agora. Tente de novo em um minuto.';
  end if;

  if (select count(*) from public.appointments
      where customer_phone = p_phone and status = 'booked' and starts_at > now()) >= v_shop.max_active_per_phone then
    raise exception 'limit' using hint = format('Este WhatsApp já tem %s horários marcados. Cancele um antes de marcar outro.', v_shop.max_active_per_phone);
  end if;

  select * into v_slot from public.available_slots(p_date, p_service_id, p_barber_id) s where s.slot_time = p_time;
  if not found then
    raise exception 'slot_taken' using hint = 'Esse horário acabou de ser reservado. Escolha outro.';
  end if;

  -- "Qualquer um": quem tem a agenda mais vazia no dia; empate fica com a ordem da equipe.
  select u.id into v_barber
  from unnest(v_slot.barber_ids) with ordinality as u(id, ord)
  order by (
    select count(*) from public.appointments a
    where a.barber_id = u.id and a.status = 'booked'
      and (a.starts_at at time zone v_shop.timezone)::date = p_date
  ), u.ord
  limit 1;

  -- Código do link: 2 UUIDs aleatórios = 244 bits. Guardamos só o hash.
  v_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  begin
    insert into public.appointments
      (barber_id, service_id, service_name, duration_min, price_cents, starts_at, ends_at,
       customer_name, customer_phone, cancel_token_hash)
    values
      (v_barber, v_service.id, v_service.name, v_service.duration_min, v_service.price_cents,
       v_slot.starts_at, v_slot.ends_at, v_name, p_phone, sha256(convert_to(v_code, 'UTF8')));
  exception when exclusion_violation then
    raise exception 'slot_taken' using hint = 'Esse horário acabou de ser reservado. Escolha outro.';
  end;

  return v_code;
end;
$$;

-- ---------- Ver e cancelar pelo link ----------

create or replace function public.get_booking(p_code text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'id', a.id,
    'barberId', a.barber_id,
    'barberName', b.name,
    'serviceName', a.service_name,
    'durationMin', a.duration_min,
    'priceCents', a.price_cents,
    'startsAt', a.starts_at,
    'endsAt', a.ends_at,
    'date', to_char(a.starts_at at time zone s.timezone, 'YYYY-MM-DD'),
    'time', to_char(a.starts_at at time zone s.timezone, 'HH24:MI'),
    'name', a.customer_name,
    'phone', a.customer_phone,
    'status', a.status
  )
  from public.appointments a
  join public.barbers b on b.id = a.barber_id
  cross join public.shop_settings s
  where coalesce(p_code, '') ~ '^[0-9a-f]{64}$'
    and a.cancel_token_hash = sha256(convert_to(p_code, 'UTF8'))
$$;

create or replace function public.cancel_booking(p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appt  public.appointments;
  v_limit integer;
begin
  select * into v_appt from public.appointments
  where coalesce(p_code, '') ~ '^[0-9a-f]{64}$'
    and cancel_token_hash = sha256(convert_to(p_code, 'UTF8'))
  for update;

  if v_appt.id is null then
    raise exception 'not_found' using hint = 'Não encontramos esse agendamento.';
  end if;
  if v_appt.status = 'cancelled' then
    return 'cancelled';
  end if;
  if v_appt.status <> 'booked' then
    raise exception 'invalid' using hint = 'Esse horário já passou.';
  end if;

  select cancel_limit_min into v_limit from public.shop_settings limit 1;
  if v_appt.starts_at - now() < make_interval(mins => v_limit) then
    raise exception 'too_late' using hint = 'Falta pouco para o horário. Para cancelar agora, fale com a barbearia.';
  end if;

  update public.appointments set status = 'cancelled' where id = v_appt.id;
  return 'cancelled';
end;
$$;

-- ---------- LGPD: apagar nome e telefone depois de 30 dias ----------

-- Fica a estatística (serviço, dia, status), sem dizer de quem era.
-- No Supabase, a 002 agenda esta função para rodar todo dia.
create or replace function public.anonymize_old_appointments()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with done as (
    update public.appointments
    set customer_name = null, customer_phone = null, anonymized_at = now()
    where ends_at < now() - interval '30 days' and anonymized_at is null
    returning 1
  )
  select count(*)::integer from done
$$;

-- ---------- Painel: trocar o expediente de um barbeiro ----------

-- Apaga as faixas antigas e grava as novas numa transação só: se algo der errado,
-- nada muda (o barbeiro nunca fica "sem expediente" no meio do caminho).
-- security invoker: roda com as permissões de quem chamou, então o RLS vale.
create or replace function public.set_working_hours(p_barber_id text, p_ranges jsonb)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Só o dono da barbearia muda o expediente.';
  end if;
  if jsonb_typeof(p_ranges) <> 'array' or jsonb_array_length(p_ranges) > 21 then
    raise exception 'invalid' using hint = 'Expediente inválido.';
  end if;

  delete from public.working_hours where barber_id = p_barber_id;
  insert into public.working_hours (barber_id, weekday, start_time, end_time)
  select p_barber_id, (r ->> 'weekday')::smallint, (r ->> 'start')::time, (r ->> 'end')::time
  from jsonb_array_elements(p_ranges) as r;

  if exists (
    select 1
    from public.working_hours a
    join public.working_hours b
      on a.barber_id = b.barber_id and a.weekday = b.weekday and a.id < b.id
     and a.start_time < b.end_time and b.start_time < a.end_time
    where a.barber_id = p_barber_id
  ) then
    raise exception 'invalid' using hint = 'Os turnos do mesmo dia se sobrepõem.';
  end if;
end;
$$;

create index appointments_starts_idx on public.appointments (starts_at);

-- ---------- Permissões ----------

-- Começa do zero e libera só o necessário.
revoke all on public.shop_settings, public.services, public.barbers, public.working_hours,
  public.time_off, public.appointments, public.admins from anon, authenticated;
revoke all on function public.is_admin(), public.available_slots(date, text, text),
  public.book_appointment(date, text, text, text, text, text), public.get_booking(text),
  public.cancel_booking(text), public.anonymize_old_appointments(),
  public.set_working_hours(text, jsonb) from public, anon, authenticated;

grant select on public.shop_settings, public.services, public.barbers, public.working_hours to anon, authenticated;
grant update on public.shop_settings to authenticated;
grant insert, update, delete on public.services, public.barbers, public.working_hours to authenticated;
grant select, insert, update, delete on public.time_off to authenticated;
grant select on public.appointments to authenticated;
-- O admin muda só o status (atendido, faltou, cancelado). Dia e hora não se mexem por aqui.
grant update (status) on public.appointments to authenticated;
grant select on public.admins to authenticated;

grant execute on function public.is_admin(), public.available_slots(date, text, text),
  public.book_appointment(date, text, text, text, text, text), public.get_booking(text),
  public.cancel_booking(text) to anon, authenticated;
grant execute on function public.set_working_hours(text, jsonb) to authenticated;
-- anonymize_old_appointments: ninguém pelo site; só o agendador do banco (002).

alter table public.shop_settings enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.appointments enable row level security;
alter table public.admins enable row level security;

create policy "loja: todos leem" on public.shop_settings
  for select to anon, authenticated using (true);
create policy "loja: admin altera" on public.shop_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Serviço ou barbeiro desativado só aparece para o admin.
create policy "serviços: leem os ativos" on public.services
  for select to anon, authenticated using (active or public.is_admin());
create policy "serviços: admin cria" on public.services
  for insert to authenticated with check (public.is_admin());
create policy "serviços: admin altera" on public.services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "serviços: admin apaga" on public.services
  for delete to authenticated using (public.is_admin());

create policy "equipe: leem os ativos" on public.barbers
  for select to anon, authenticated using (active or public.is_admin());
create policy "equipe: admin cria" on public.barbers
  for insert to authenticated with check (public.is_admin());
create policy "equipe: admin altera" on public.barbers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "equipe: admin apaga" on public.barbers
  for delete to authenticated using (public.is_admin());

create policy "expediente: todos leem" on public.working_hours
  for select to anon, authenticated using (true);
create policy "expediente: admin cria" on public.working_hours
  for insert to authenticated with check (public.is_admin());
create policy "expediente: admin altera" on public.working_hours
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "expediente: admin apaga" on public.working_hours
  for delete to authenticated using (public.is_admin());

-- O motivo do bloqueio pode ser pessoal ("médico"): só o admin vê.
create policy "bloqueios: só admin" on public.time_off
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Nome e telefone dos clientes: só o admin. Ninguém cria agendamento direto na tabela.
create policy "agenda: admin lê" on public.appointments
  for select to authenticated using (public.is_admin());
create policy "agenda: admin muda status" on public.appointments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins: cada um vê a própria linha" on public.admins
  for select to authenticated using (user_id = auth.uid());
