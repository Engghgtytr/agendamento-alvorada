-- Pet shop + lembrete + confirmação de presença. Rode depois de 001, 002 e 003.
--
-- Pet shop (shop_settings.pet_mode = true):
--   o cliente informa nome do pet, porte (p, m, g) e raça; o serviço pode ter preço por porte
--   (services.size_prices = {"p": 5000, "m": 6000, "g": 8000}). O preço vem do banco, nunca da tela.
-- Lembrete: o dono manda pelo WhatsApp com um toque (o painel abre a mensagem pronta) e o banco
--   guarda quando foi (reminded_at). O cliente confirma pelo link dele (confirm_booking) ou o dono
--   marca como confirmado quando ele responde (confirmed_at).

alter table public.shop_settings add column if not exists pet_mode boolean not null default false;

alter table public.services add column if not exists size_prices jsonb
  check (size_prices is null or jsonb_typeof(size_prices) = 'object');

alter table public.appointments
  add column if not exists pet_name     text check (char_length(pet_name) between 1 and 40),
  add column if not exists pet_size     text check (pet_size in ('p', 'm', 'g')),
  add column if not exists pet_breed    text check (char_length(pet_breed) between 1 and 40),
  add column if not exists confirmed_at timestamptz,
  add column if not exists reminded_at  timestamptz;

-- Preço por porte: só as chaves p, m, g, com centavos inteiros entre 0 e 1.000.000.
-- (Feito por trigger porque CHECK não aceita subconsulta.)
create or replace function public.check_size_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.size_prices is not null and exists (
    select 1 from jsonb_each(new.size_prices) e
    where e.key not in ('p', 'm', 'g') or jsonb_typeof(e.value) <> 'number'
       or (e.value)::numeric not between 0 and 1000000 or (e.value)::numeric <> floor((e.value)::numeric)
  ) or new.size_prices = '{}'::jsonb then
    raise exception 'Preço por porte inválido' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger services_size_prices before insert or update on public.services
  for each row execute function public.check_size_prices();

-- ---------- Agendar (agora com o pet) ----------

drop function if exists public.book_appointment(date, text, text, text, text, text);

create or replace function public.book_appointment(
  p_date date,
  p_time text,
  p_service_id text,
  p_barber_id text,
  p_name text,
  p_phone text,
  p_pet_name text default null,
  p_pet_size text default null,
  p_pet_breed text default null
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
  v_pet     text := nullif(regexp_replace(btrim(coalesce(p_pet_name, '')), '\s+', ' ', 'g'), '');
  v_breed   text := nullif(regexp_replace(btrim(coalesce(p_pet_breed, '')), '\s+', ' ', 'g'), '');
  v_price   integer;
  v_code    text;
begin
  select * into v_shop from public.shop_settings limit 1;
  select * into v_service from public.services where id = p_service_id and active;
  if v_service.id is null then
    raise exception 'invalid' using hint = 'Escolha o serviço de novo.';
  end if;
  if p_barber_id is not null and not exists (select 1 from public.barbers where id = p_barber_id and active) then
    raise exception 'invalid' using hint = 'Escolha o profissional de novo.';
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

  -- Pet shop: nome e porte do pet são obrigatórios; fora do modo pet, nada de pet é guardado.
  if v_shop.pet_mode then
    if v_pet is null or char_length(v_pet) > 40 then
      raise exception 'invalid' using hint = 'Confira o nome do pet.';
    end if;
    if coalesce(p_pet_size, '') not in ('p', 'm', 'g') then
      raise exception 'invalid' using hint = 'Escolha o porte do pet.';
    end if;
    if char_length(v_breed) > 40 then
      raise exception 'invalid' using hint = 'Confira a raça do pet.';
    end if;
  else
    v_pet := null;
    v_breed := null;
    p_pet_size := null;
  end if;
  -- Preço: o do porte, se o serviço tiver preço por porte; senão o preço normal.
  v_price := coalesce((v_service.size_prices->>p_pet_size)::integer, v_service.price_cents);

  perform pg_advisory_xact_lock(hashtext('alvorada:book'));

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

  select u.id into v_barber
  from unnest(v_slot.barber_ids) with ordinality as u(id, ord)
  order by (
    select count(*) from public.appointments a
    where a.barber_id = u.id and a.status = 'booked'
      and (a.starts_at at time zone v_shop.timezone)::date = p_date
  ), u.ord
  limit 1;

  v_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  begin
    insert into public.appointments
      (barber_id, service_id, service_name, duration_min, price_cents, starts_at, ends_at,
       customer_name, customer_phone, cancel_token_hash, pet_name, pet_size, pet_breed)
    values
      (v_barber, v_service.id, v_service.name, v_service.duration_min, v_price,
       v_slot.starts_at, v_slot.ends_at, v_name, p_phone, sha256(convert_to(v_code, 'UTF8')), v_pet, p_pet_size, v_breed);
  exception when exclusion_violation then
    raise exception 'slot_taken' using hint = 'Esse horário acabou de ser reservado. Escolha outro.';
  end;

  return v_code;
end;
$$;

-- ---------- Ver o horário (link do cliente): agora com o pet e a confirmação ----------

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
    'status', a.status,
    'petName', a.pet_name,
    'petSize', a.pet_size,
    'petBreed', a.pet_breed,
    'confirmedAt', a.confirmed_at
  )
  from public.appointments a
  join public.barbers b on b.id = a.barber_id
  cross join public.shop_settings s
  where coalesce(p_code, '') ~ '^[0-9a-f]{64}$'
    and a.cancel_token_hash = sha256(convert_to(p_code, 'UTF8'))
$$;

-- ---------- Confirmar presença (link do cliente) ----------

create or replace function public.confirm_booking(p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments
  where coalesce(p_code, '') ~ '^[0-9a-f]{64}$'
    and cancel_token_hash = sha256(convert_to(p_code, 'UTF8'))
  for update;
  if v_appt.id is null then
    raise exception 'not_found' using hint = 'Não encontramos esse agendamento.';
  end if;
  if v_appt.status <> 'booked' or v_appt.starts_at <= now() then
    raise exception 'invalid' using hint = 'Esse horário não está mais marcado.';
  end if;
  update public.appointments set confirmed_at = coalesce(confirmed_at, now()) where id = v_appt.id;
  return 'confirmed';
end;
$$;

-- ---------- Limpeza LGPD: também apaga o nome e a raça do pet ----------

create or replace function public.anonymize_old_appointments()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with done as (
    update public.appointments
    set customer_name = null, customer_phone = null, pet_name = null, pet_breed = null, anonymized_at = now()
    where ends_at < now() - interval '30 days' and anonymized_at is null
    returning 1
  )
  select count(*)::integer from done
$$;

-- ---------- Permissões ----------

revoke all on function public.book_appointment(date, text, text, text, text, text, text, text, text),
  public.confirm_booking(text), public.check_size_prices() from public, anon, authenticated;
grant execute on function public.book_appointment(date, text, text, text, text, text, text, text, text),
  public.confirm_booking(text) to anon, authenticated;
-- O dono marca "lembrete enviado" e "confirmado" (quando o cliente responde no WhatsApp).
grant update (reminded_at, confirmed_at) on public.appointments to authenticated;
