// Testes do banco: roda as migrations reais num PostgreSQL embutido (PGlite) e confere
// quem pode ler e alterar o quê (RLS), a trava contra horário duplicado e as regras.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { availableSlots } from '../src/utils/slots.js';
import { addDays, dateKey, toInstant, weekdayOf } from '../src/utils/time.js';
import { shop, services, workingHours } from '../src/data/demo-shop.js';

const sql = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SP = 'America/Sao_Paulo';
const DONO = '00000000-0000-0000-0000-0000000000d0';
const OUTRA_CONTA = '00000000-0000-0000-0000-0000000000c1';

// Datas reais a partir de hoje (as funções do banco usam o relógio de verdade).
function nextWeekday(weekday, minDaysAhead) {
  let date = addDays(dateKey(new Date(), SP), minDaysAhead);
  while (weekdayOf(date) !== weekday) date = addDays(date, 1);
  return date;
}
const TERCA = nextWeekday(2, 2);
const QUARTA = nextWeekday(3, 2);
const SEGUNDA = nextWeekday(1, 1);

let db;

// Executa uma consulta "como" um usuário (ou como visitante anônimo),
// do mesmo jeito que o Supabase faz a cada requisição.
async function as(userId, query, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  try {
    return (await db.query(query, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const asOwner = async (query, params = []) => {
  await db.exec('reset role');
  return (await db.query(query, params)).rows;
};

const slots = (date, serviceId = 'corte', barberId = null) =>
  as(null, 'select * from public.available_slots($1::date, $2, $3)', [date, serviceId, barberId]);

const book = async (date, time, { serviceId = 'corte', barberId = 'caio', name = 'Ana', phone = '5511912345678' } = {}) =>
  (await as(null, 'select public.book_appointment($1::date, $2, $3, $4, $5, $6) as code', [date, time, serviceId, barberId, name, phone]))[0].code;

const hashOf = (code) => createHash('sha256').update(code).digest();

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(sql('../supabase/tests/supabase-stub.sql'));
  await db.exec(sql('../supabase/migrations/001_agendamento.sql'));
  await db.exec(sql('../supabase/migrations/003_seed.sql'));
  // 004 por cima: tudo que já funcionava continua igual com o pet e o lembrete instalados
  await db.exec(sql('../supabase/migrations/004_pet_lembrete.sql'));
  await asOwner(`insert into auth.users (id, email) values ($1, 'dono@exemplo.com'), ($2, 'outra@exemplo.com')`, [DONO, OUTRA_CONTA]);
  await asOwner('insert into public.admins (user_id) values ($1)', [DONO]);
}, 60000);

describe('visitante (sem login)', () => {
  it('lê serviços, equipe e expediente', async () => {
    expect(await as(null, 'select id from public.services')).toHaveLength(5);
    expect(await as(null, 'select id from public.barbers')).toHaveLength(3);
    expect((await as(null, 'select count(*)::int as n from public.working_hours'))[0].n).toBeGreaterThan(10);
  });

  it('NÃO lê a agenda nem os bloqueios, e não cria agendamento direto na tabela', async () => {
    await expect(as(null, 'select * from public.appointments')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from public.time_off')).rejects.toThrow(/permission denied/);
    await expect(
      as(null, `insert into public.appointments (barber_id, service_name, duration_min, price_cents, starts_at, ends_at, cancel_token_hash)
                values ('caio', 'x', 40, 1, now() + interval '2 days', now() + interval '2 days 40 minutes', '\\x00')`),
    ).rejects.toThrow(/permission denied/);
  });

  it('não roda a limpeza de dados nem mexe em preço', async () => {
    await expect(as(null, 'select public.anonymize_old_appointments()')).rejects.toThrow(/permission denied/);
    await expect(as(null, `update public.services set price_cents = 1 where id = 'corte'`)).rejects.toThrow(/permission denied/);
  });
});

describe('horários livres', () => {
  it('o banco e o site calculam a mesma grade', async () => {
    for (const [date, barberId, serviceId] of [
      [TERCA, null, 'corte'],
      [QUARTA, null, 'corte-barba'],
      [QUARTA, 'lia', 'barba'],
    ]) {
      const fromDb = (await slots(date, serviceId, barberId)).map((s) => `${s.slot_time}:${s.barber_ids.join('+')}`);
      const fromJs = availableSlots({
        date,
        shop,
        service: services.find((s) => s.id === serviceId),
        barberIds: barberId ? [barberId] : ['caio', 'rafa', 'lia'],
        workingHours,
        now: new Date(),
      }).map((s) => `${s.time}:${s.barberIds.join('+')}`);
      expect(fromDb.length).toBeGreaterThan(5);
      expect(fromDb).toEqual(fromJs);
    }
  });

  it('dia fechado, dia que passou e dia fora da janela não têm horário', async () => {
    expect(await slots(SEGUNDA)).toEqual([]);
    expect(await slots(addDays(dateKey(new Date(), SP), -3))).toEqual([]);
    expect(await slots(addDays(dateKey(new Date(), SP), 40))).toEqual([]);
  });

  it('não devolve nome nem telefone de ninguém', async () => {
    const [first] = await slots(TERCA);
    expect(Object.keys(first).sort()).toEqual(['barber_ids', 'ends_at', 'slot_time', 'starts_at']);
  });
});

describe('marcar', () => {
  it('marca, o horário some da grade e o código não fica guardado no banco', async () => {
    const code = await book(TERCA, '09:00');
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    const caio = (await slots(TERCA, 'corte', 'caio')).map((s) => s.slot_time);
    expect(caio).not.toContain('09:00');
    expect(caio).not.toContain('09:30'); // 09:30–10:10 bateria no 09:00–09:40
    expect(caio).toContain('09:45');

    const rows = await asOwner(`select * from public.appointments where customer_name = 'Ana'`);
    expect(JSON.stringify(rows)).not.toContain(code);
    expect(Buffer.from(rows[0].cancel_token_hash)).toEqual(hashOf(code));
  });

  it('o mesmo horário duas vezes: o segundo recebe "slot_taken"', async () => {
    const results = await Promise.allSettled([
      book(TERCA, '15:00', { name: 'Bia', phone: '5511911111111' }),
      book(TERCA, '15:00', { name: 'Caio', phone: '5511922222222' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.message).toBe('slot_taken');
  });

  it('a trava é do próprio banco: nem gravando direto na tabela dá para sobrepor', async () => {
    const start = toInstant(TERCA, '15:20', SP);
    await expect(
      asOwner(
        `insert into public.appointments (barber_id, service_name, duration_min, price_cents, starts_at, ends_at, cancel_token_hash)
         values ('caio', 'Corte', 40, 4500, $1, $2, '\\x01')`,
        [start, new Date(+start + 40 * 60_000)],
      ),
    ).rejects.toThrow(/appointments_no_overlap/);
  });

  it('"qualquer um" fica com quem tem a agenda mais vazia', async () => {
    // Caio já tem 2 horários na terça; Rafa, nenhum. Às 10:00 os dois estão livres.
    const code = await book(TERCA, '10:00', { barberId: null, name: 'Davi', phone: '5511933333333' });
    const [booking] = await as(null, 'select public.get_booking($1) as b', [code]);
    expect(booking.b.barberId).toBe('rafa');
  });

  it('no máximo 2 horários futuros por WhatsApp', async () => {
    const phone = '5511944444444';
    await book(QUARTA, '09:00', { barberId: 'lia', phone });
    await book(QUARTA, '13:30', { barberId: 'lia', phone });
    await expect(book(QUARTA, '15:00', { barberId: 'lia', phone })).rejects.toThrow('limit');
  });

  it('recusa nome, telefone, serviço e horário inválidos', async () => {
    await expect(book(TERCA, '11:00', { name: ' ' })).rejects.toThrow('invalid');
    await expect(book(TERCA, '11:00', { name: '1234' })).rejects.toThrow('invalid');
    await expect(book(TERCA, '11:00', { phone: '912345678' })).rejects.toThrow('invalid');
    await expect(book(TERCA, '11:00', { serviceId: 'tatuagem' })).rejects.toThrow('invalid');
    await expect(book(TERCA, '25:00')).rejects.toThrow('invalid');
    await expect(book(TERCA, '09:10')).rejects.toThrow('slot_taken'); // fora da grade de 15 min
    await expect(book(SEGUNDA, '10:00')).rejects.toThrow('slot_taken'); // dia fechado
  });

  it('bloqueio do dono tira os horários', async () => {
    const from = toInstant(QUARTA, '16:00', SP);
    await asOwner(`insert into public.time_off (barber_id, starts_at, ends_at, reason) values ('lia', $1, $2, 'médico')`, [
      from,
      toInstant(QUARTA, '18:00', SP),
    ]);
    const lia = (await slots(QUARTA, 'corte', 'lia')).map((s) => s.slot_time);
    expect(lia.some((t) => t >= '15:30')).toBe(false); // 15:30 + 40 min já bateria às 16:00
    expect(lia).toContain('15:15');
  });

  it('freio contra robô: muitos agendamentos no mesmo minuto', async () => {
    const far = toInstant(addDays(TERCA, 7), '09:00', SP);
    await asOwner(
      `insert into public.appointments (barber_id, service_name, duration_min, price_cents, starts_at, ends_at, status, cancel_token_hash)
       select 'rafa', 'x', 15, 0, $1::timestamptz, $1::timestamptz + interval '15 minutes', 'cancelled', sha256(i::text::bytea)
       from generate_series(1, 30) i`,
      [far],
    );
    await expect(book(QUARTA, '10:00', { barberId: 'rafa', phone: '5511955555555' })).rejects.toThrow('busy');
    await asOwner(`delete from public.appointments where service_name = 'x'`);
  });
});

describe('ver e cancelar pelo link', () => {
  it('quem tem o código vê o horário; código errado não vê nada', async () => {
    const code = await book(TERCA, '13:00', { name: 'Eva', phone: '5511966666666' });
    const [{ b }] = await as(null, 'select public.get_booking($1) as b', [code]);
    expect(b).toMatchObject({ name: 'Eva', time: '13:00', date: TERCA, status: 'booked', barberName: 'Caio' });
    expect((await as(null, 'select public.get_booking($1) as b', ['0'.repeat(64)]))[0].b).toBeNull();
    expect((await as(null, 'select public.get_booking($1) as b', ["' or 1=1 --"]))[0].b).toBeNull();
  });

  it('cancela com antecedência e o horário volta para a grade', async () => {
    const code = await book(TERCA, '16:00', { name: 'Fabi', phone: '5511977777777' });
    expect((await slots(TERCA, 'corte', 'caio')).map((s) => s.slot_time)).not.toContain('16:00');
    const [{ s }] = await as(null, 'select public.cancel_booking($1) as s', [code]);
    expect(s).toBe('cancelled');
    expect((await slots(TERCA, 'corte', 'caio')).map((s) => s.slot_time)).toContain('16:00');
  });

  it('com menos de 2 horas, não cancela pelo link', async () => {
    const code = 'a'.repeat(64);
    await asOwner(
      `insert into public.appointments (barber_id, service_name, duration_min, price_cents, starts_at, ends_at, customer_name, customer_phone, cancel_token_hash)
       values ('rafa', 'Corte', 40, 4500, now() + interval '1 hour', now() + interval '100 minutes', 'Gil', '5511988888888', $1)`,
      [hashOf(code)],
    );
    await expect(as(null, 'select public.cancel_booking($1)', [code])).rejects.toThrow('too_late');
    await expect(as(null, 'select public.cancel_booking($1)', ['b'.repeat(64)])).rejects.toThrow('not_found');
  });
});

describe('painel do dono', () => {
  it('o admin vê a agenda e muda o status', async () => {
    const rows = await as(DONO, `select id, customer_name from public.appointments where customer_name = 'Eva'`);
    expect(rows).toHaveLength(1);
    await as(DONO, `update public.appointments set status = 'done' where id = $1`, [rows[0].id]);
    expect((await asOwner('select status from public.appointments where id = $1', [rows[0].id]))[0].status).toBe('done');
  });

  it('nem o admin muda dia e hora por fora das regras', async () => {
    await expect(as(DONO, `update public.appointments set starts_at = now()`)).rejects.toThrow(/permission denied/);
  });

  it('o admin troca o expediente de uma vez, e turnos sobrepostos são recusados sem mudar nada', async () => {
    const ranges = JSON.stringify([
      { weekday: 2, start: '10:00', end: '12:00' },
      { weekday: 2, start: '14:00', end: '18:00' },
    ]);
    await as(DONO, 'select public.set_working_hours($1, $2::jsonb)', ['rafa', ranges]);
    const rafa = await asOwner(`select weekday, start_time::text as s from public.working_hours where barber_id = 'rafa' order by s`);
    expect(rafa).toEqual([
      { weekday: 2, s: '10:00:00' },
      { weekday: 2, s: '14:00:00' },
    ]);

    const bad = JSON.stringify([
      { weekday: 3, start: '09:00', end: '13:00' },
      { weekday: 3, start: '12:00', end: '15:00' },
    ]);
    await expect(as(DONO, 'select public.set_working_hours($1, $2::jsonb)', ['rafa', bad])).rejects.toThrow('invalid');
    expect(await asOwner(`select 1 from public.working_hours where barber_id = 'rafa'`)).toHaveLength(2); // nada mudou
  });

  it('quem não é admin não muda o expediente', async () => {
    await expect(as(OUTRA_CONTA, 'select public.set_working_hours($1, $2::jsonb)', ['caio', '[]'])).rejects.toThrow('forbidden');
    await expect(as(null, 'select public.set_working_hours($1, $2::jsonb)', ['caio', '[]'])).rejects.toThrow(/permission denied/);
    expect((await asOwner(`select count(*)::int as n from public.working_hours where barber_id = 'caio'`))[0].n).toBe(9);
  });

  it('conta logada que não é admin não vê nenhum cliente', async () => {
    expect(await as(OUTRA_CONTA, 'select * from public.appointments')).toEqual([]);
    expect(await as(OUTRA_CONTA, 'select * from public.time_off')).toEqual([]);
    await expect(as(OUTRA_CONTA, `update public.services set price_cents = 1 where id = 'corte'`)).resolves.toEqual([]);
    expect((await asOwner(`select price_cents from public.services where id = 'corte'`))[0].price_cents).toBe(4500);
  });
});

describe('LGPD', () => {
  it('apaga nome e telefone 30 dias depois do horário e mantém o resto', async () => {
    await asOwner(
      `insert into public.appointments (barber_id, service_name, duration_min, price_cents, starts_at, ends_at, customer_name, customer_phone, status, cancel_token_hash)
       values ('caio', 'Corte', 40, 4500, now() - interval '40 days', now() - interval '40 days' + interval '40 minutes', 'Antigo', '5511999999999', 'done', '\\x02')`,
    );
    const [{ n }] = await asOwner('select public.anonymize_old_appointments() as n');
    expect(n).toBe(1);
    const [old] = await asOwner(`select customer_name, customer_phone, service_name, anonymized_at from public.appointments where cancel_token_hash = '\\x02'`);
    expect(old).toMatchObject({ customer_name: null, customer_phone: null, service_name: 'Corte' });
    expect(old.anonymized_at).not.toBeNull();
    // Os horários recentes continuam com nome
    expect(await asOwner(`select 1 from public.appointments where customer_name = 'Eva'`)).toHaveLength(1);
  });
});
