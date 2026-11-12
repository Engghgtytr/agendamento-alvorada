// 004_pet_lembrete.sql num PostgreSQL embutido: pet obrigatório no modo pet shop, preço por porte
// vindo do banco, confirmação pelo link e lembrete/confirmação marcados pelo dono.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { addDays, dateKey, weekdayOf } from '../src/utils/time.js';

const sql = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SP = 'America/Sao_Paulo';
const DONO = '00000000-0000-0000-0000-0000000000d0';

function nextWeekday(weekday, minDaysAhead) {
  let date = addDays(dateKey(new Date(), SP), minDaysAhead);
  while (weekdayOf(date) !== weekday) date = addDays(date, 1);
  return date;
}
const TERCA = nextWeekday(2, 2);

let db;
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

const BOOK = 'select public.book_appointment($1::date, $2, $3, $4, $5, $6, $7, $8, $9) as code';
const book = async (time, { phone = '5511912345678', pet = 'Thor', size = 'g', breed = 'Golden', barber = 'caio' } = {}) =>
  (await as(null, BOOK, [TERCA, time, 'corte', barber, 'Ana', phone, pet, size, breed]))[0].code;
const appt = async (code) =>
  (await asOwner(`select * from public.appointments where cancel_token_hash = sha256(convert_to($1, 'UTF8'))`, [code]))[0];

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(sql('../supabase/tests/supabase-stub.sql'));
  await db.exec(sql('../supabase/migrations/001_agendamento.sql'));
  await db.exec(sql('../supabase/migrations/003_seed.sql'));
  await db.exec(sql('../supabase/migrations/004_pet_lembrete.sql'));
  await asOwner(`insert into auth.users (id, email) values ($1, 'dono@exemplo.com')`, [DONO]);
  await asOwner('insert into public.admins (user_id) values ($1)', [DONO]);
}, 60000);

describe('fora do modo pet', () => {
  it('agenda como antes e não guarda nada de pet', async () => {
    const code = await book('09:00');
    const a = await appt(code);
    expect(a.pet_name).toBeNull();
    expect(a.pet_size).toBeNull();
    expect(a.price_cents).toBe(4500);
  });
});

describe('modo pet shop', () => {
  beforeAll(async () => {
    await asOwner('update public.shop_settings set pet_mode = true');
    await asOwner(`update public.services set size_prices = '{"p": 5000, "m": 6000, "g": 8000}' where id = 'corte'`);
  });

  it('guarda o pet e cobra o preço do porte, calculado no banco', async () => {
    const code = await book('10:00', { phone: '5511900000001', size: 'm' });
    const a = await appt(code);
    expect(a).toMatchObject({ pet_name: 'Thor', pet_size: 'm', pet_breed: 'Golden', price_cents: 6000 });
  });

  it('exige nome e porte do pet', async () => {
    await expect(book('11:00', { phone: '5511900000002', pet: '' })).rejects.toThrow(/invalid/);
    await expect(book('11:00', { phone: '5511900000002', size: 'xg' })).rejects.toThrow(/invalid/);
  });

  it('o banco recusa preço por porte inválido', async () => {
    await expect(asOwner(`update public.services set size_prices = '{"p": -5}' where id = 'barba'`)).rejects.toThrow();
    await expect(asOwner(`update public.services set size_prices = '{"gigante": 100}' where id = 'barba'`)).rejects.toThrow();
  });

  it('o link mostra o pet e confirma a presença', async () => {
    const code = await book('13:00', { phone: '5511900000003', size: 'p' });
    const [{ b }] = await as(null, 'select public.get_booking($1) as b', [code]);
    expect(b).toMatchObject({ petName: 'Thor', petSize: 'p', priceCents: 5000, confirmedAt: null });
    await as(null, 'select public.confirm_booking($1)', [code]);
    expect((await appt(code)).confirmed_at).not.toBeNull();
    await expect(as(null, 'select public.confirm_booking($1)', ['f'.repeat(64)])).rejects.toThrow(/not_found/);
  });
});

describe('lembrete e confirmação pelo dono', () => {
  it('o dono marca lembrete e confirmado, mas não muda o preço', async () => {
    const code = await book('14:00', { phone: '5511900000004' });
    const { id } = await appt(code);
    await as(DONO, 'update public.appointments set reminded_at = now(), confirmed_at = now() where id = $1', [id]);
    const a = await appt(code);
    expect(a.reminded_at).not.toBeNull();
    expect(a.confirmed_at).not.toBeNull();
    await expect(as(DONO, 'update public.appointments set price_cents = 1 where id = $1', [id])).rejects.toThrow(/permission denied/);
  });

  it('visitante não marca confirmado direto na tabela', async () => {
    await expect(as(null, 'update public.appointments set confirmed_at = now()')).rejects.toThrow(/permission denied/);
  });
});

describe('LGPD', () => {
  it('a limpeza de 30 dias também apaga nome e raça do pet', async () => {
    const code = await book('15:00', { phone: '5511900000005' });
    const { id } = await appt(code);
    await asOwner(`alter table public.appointments disable trigger all`);
    await asOwner(`update public.appointments set starts_at = now() - interval '40 days', ends_at = now() - interval '40 days' + interval '40 minutes' where id = $1`, [id]);
    await asOwner(`alter table public.appointments enable trigger all`);
    await asOwner('select public.anonymize_old_appointments()');
    const a = await appt(code);
    expect(a).toMatchObject({ pet_name: null, pet_breed: null, customer_name: null });
  });
});
