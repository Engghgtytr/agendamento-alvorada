-- Dados da barbearia FICTÍCIA (os mesmos de src/data/demo-shop.js).
-- Num cliente de verdade, troque pelos dados dele ou cadastre pelo painel.

insert into public.shop_settings (id, name, whatsapp, timezone)
values (1, 'Barbearia Alvorada', null, 'America/Sao_Paulo');

insert into public.services (id, name, description, duration_min, price_cents, position) values
  ('corte', 'Corte', 'Tesoura ou máquina, com lavagem e finalização.', 40, 4500, 1),
  ('barba', 'Barba', 'Toalha quente, navalha e balm.', 30, 3500, 2),
  ('corte-barba', 'Corte + barba', 'Os dois juntos, numa sessão só.', 70, 7500, 3),
  ('acabamento', 'Acabamento', 'Pezinho e contorno entre um corte e outro.', 20, 2000, 4),
  ('sobrancelha', 'Sobrancelha', 'Limpeza na navalha ou na pinça.', 15, 1500, 5);

insert into public.barbers (id, name, specialty, position) values
  ('caio', 'Caio', 'Degradê e corte na máquina', 1),
  ('rafa', 'Rafa', 'Barba na navalha e toalha quente', 2),
  ('lia', 'Lia', 'Corte na tesoura e cabelo comprido', 3);

-- 0 = domingo … 6 = sábado
insert into public.working_hours (barber_id, weekday, start_time, end_time)
select 'caio', d, t.s::time, t.e::time from unnest(array[2, 3, 4, 5]) d, (values ('09:00', '12:00'), ('13:00', '19:00')) t(s, e)
union all select 'caio', 6, '08:00', '14:00'
union all
select 'rafa', d, t.s::time, t.e::time from unnest(array[2, 3, 4, 5]) d, (values ('10:00', '13:00'), ('14:00', '20:00')) t(s, e)
union all select 'rafa', 6, '08:00', '14:00'
union all
select 'lia', d, t.s::time, t.e::time from unnest(array[3, 4, 5]) d, (values ('09:00', '12:30'), ('13:30', '18:00')) t(s, e)
union all select 'lia', 6, '08:00', '14:00';
