// Versão com banco de verdade (Supabase). Mesmas funções do modo demonstração,
// para as telas não precisarem saber qual das duas está em uso.
//
// Toda regra importante está no banco (supabase/migrations/001): a tela só chama
// as funções available_slots, book_appointment, get_booking e cancel_booking.

import { createClient } from '@supabase/supabase-js';
import { BookingError, randomCode } from './demo-api.js';
import { bookingDays, isOpenDay } from '../utils/slots.js';
import { addDays, timeLabel, toInstant } from '../utils/time.js';

// Mensagem genérica de propósito: não revela se o e-mail tem conta.
const AUTH_MESSAGES = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme o e-mail pelo link que você recebeu antes de entrar.',
  over_request_rate_limit: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
};

const KNOWN = new Set(['slot_taken', 'limit', 'busy', 'invalid', 'too_late', 'not_found']);

// O banco devolve a palavra-chave na mensagem e o texto para a pessoa no "hint".
function fail(error) {
  if (KNOWN.has(error.message)) throw new BookingError(error.message, error.hint);
  throw error;
}

export function createSupabaseApi(url, key) {
  const db = createClient(url, key);
  let cache = null;

  async function getShop({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const [shopRes, servicesRes, barbersRes, hoursRes] = await Promise.all([
      db.from('shop_settings').select('*').single(),
      db.from('services').select('*').order('position'),
      db.from('barbers').select('*').order('position'),
      db.from('working_hours').select('barber_id, weekday, start_time, end_time'),
    ]);
    for (const res of [shopRes, servicesRes, barbersRes, hoursRes]) if (res.error) throw res.error;

    const s = shopRes.data;
    cache = {
      shop: {
        name: s.name,
        whatsapp: s.whatsapp,
        timezone: s.timezone,
        slotStepMin: s.slot_step_min,
        minNoticeMin: s.min_notice_min,
        windowDays: s.window_days,
        cancelLimitMin: s.cancel_limit_min,
        maxActivePerPhone: s.max_active_per_phone,
      },
      services: servicesRes.data.map((x) => ({
        id: x.id,
        name: x.name,
        description: x.description,
        durationMin: x.duration_min,
        priceCents: x.price_cents,
        active: x.active,
        position: x.position,
      })),
      barbers: barbersRes.data.map((x) => ({ id: x.id, name: x.name, specialty: x.specialty })),
      // "09:00:00" → "09:00"
      workingHours: hoursRes.data.map((x) => ({
        barberId: x.barber_id,
        weekday: x.weekday,
        start: x.start_time.slice(0, 5),
        end: x.end_time.slice(0, 5),
      })),
    };
    return cache;
  }

  const check = ({ error }) => {
    if (error) {
      console.error(error);
      throw new Error('Não deu para salvar. Confira a internet e tente de novo.');
    }
  };

  // Login do dono. Esconder telas no site é só conforto: quem barra de verdade é o RLS.
  const session = {
    async current() {
      const { data } = await db.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const { data: row, error } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (error) throw new Error('Não deu para conferir seu acesso. Confira a internet e tente de novo.');
      return { email: user.email, isAdmin: Boolean(row) };
    },
    async signIn(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        if (String(error.message).includes('fetch')) throw new Error('Sem conexão com o servidor. Confira a internet.');
        throw new Error(AUTH_MESSAGES[error.code] ?? 'Não deu para entrar. Tente de novo.');
      }
      return session.current();
    },
    async signOut() {
      await db.auth.signOut();
    },
  };

  const admin = {
    async getShop() {
      cache = null; // o painel sempre vê o estado atual, inclusive serviços desativados
      return getShop({ fresh: true });
    },

    async getDay(date) {
      const { shop } = await getShop();
      const start = toInstant(date, '00:00', shop.timezone).toISOString();
      const end = toInstant(addDays(date, 1), '00:00', shop.timezone).toISOString();
      const [appts, off] = await Promise.all([
        db.from('appointments').select('*').gte('starts_at', start).lt('starts_at', end).order('starts_at'),
        db.from('time_off').select('*').lt('starts_at', end).gt('ends_at', start).order('starts_at'),
      ]);
      if (appts.error) throw appts.error;
      if (off.error) throw off.error;
      return {
        appointments: appts.data.map((a) => ({
          id: a.id,
          barberId: a.barber_id,
          serviceName: a.service_name,
          durationMin: a.duration_min,
          priceCents: a.price_cents,
          startsAt: a.starts_at,
          endsAt: a.ends_at,
          time: timeLabel(new Date(a.starts_at), shop.timezone),
          name: a.customer_name,
          phone: a.customer_phone,
          status: a.status,
        })),
        timeOff: off.data.map((t) => ({ id: t.id, barberId: t.barber_id, startsAt: t.starts_at, endsAt: t.ends_at, reason: t.reason })),
      };
    },

    async setStatus(id, status) {
      // .select() devolve a linha alterada: se o RLS barrar, volta vazio em vez de erro.
      const res = await db.from('appointments').update({ status }).eq('id', id).select('id');
      check(res);
      if (!res.data.length) throw new Error('Você não tem permissão para mudar este horário.');
    },

    async addTimeOff({ barberId, date, start, end, reason = '' }) {
      const { shop } = await getShop();
      check(
        await db.from('time_off').insert({
          barber_id: barberId,
          starts_at: toInstant(date, start, shop.timezone).toISOString(),
          ends_at: toInstant(date, end, shop.timezone).toISOString(),
          reason: String(reason).trim(),
        }),
      );
    },

    async removeTimeOff(id) {
      check(await db.from('time_off').delete().eq('id', id));
    },

    async saveService(s) {
      const row = { id: s.id };
      if ('name' in s) row.name = s.name;
      if ('description' in s) row.description = s.description;
      if ('durationMin' in s) row.duration_min = s.durationMin;
      if ('priceCents' in s) row.price_cents = s.priceCents;
      if ('active' in s) row.active = s.active;
      if ('position' in s) row.position = s.position;
      const exists = (cache?.services ?? []).some((x) => x.id === s.id);
      check(exists ? await db.from('services').update(row).eq('id', s.id) : await db.from('services').insert(row));
      cache = null;
    },

    async saveHours(barberId, ranges) {
      const { error } = await db.rpc('set_working_hours', {
        p_barber_id: barberId,
        p_ranges: ranges.map(({ weekday, start, end }) => ({ weekday, start, end })),
      });
      if (error) {
        if (error.message === 'invalid') throw new Error(error.hint);
        check({ error });
      }
      cache = null;
    },
  };

  return {
    mode: 'supabase',
    session,
    admin,

    // Com o dono logado, o RLS também devolve serviços desativados: o site público
    // filtra para mostrar só os ativos.
    async getShop() {
      const data = await getShop();
      return { ...data, services: data.services.filter((s) => s.active !== false) };
    },

    async getDays({ barberId = 'any' } = {}) {
      const { shop, barbers, workingHours } = await getShop();
      const ids = barberId === 'any' ? barbers.map((b) => b.id) : [barberId];
      return bookingDays(shop, new Date()).map((date) => ({ date, open: isOpenDay(date, workingHours, ids) }));
    },

    async getSlots({ date, serviceId, barberId }) {
      const { data, error } = await db.rpc('available_slots', {
        p_date: date,
        p_service_id: serviceId,
        p_barber_id: barberId === 'any' ? null : barberId,
      });
      if (error) throw error;
      return data.map((s) => ({
        time: s.slot_time,
        startsAt: new Date(s.starts_at),
        endsAt: new Date(s.ends_at),
        barberIds: s.barber_ids,
      }));
    },

    async book({ date, time, serviceId, barberId, name, phone, website = '' }) {
      if (website) return { code: randomCode() }; // robô: finge que deu certo e não envia nada
      const { data, error } = await db.rpc('book_appointment', {
        p_date: date,
        p_time: time,
        p_service_id: serviceId,
        p_barber_id: barberId === 'any' ? null : barberId,
        p_name: name,
        p_phone: phone,
      });
      if (error) fail(error);
      return { code: data };
    },

    async getBooking(code) {
      const [{ shop }, res] = await Promise.all([getShop(), db.rpc('get_booking', { p_code: code })]);
      if (res.error) throw res.error;
      const b = res.data;
      if (!b) return null;
      return {
        appointment: { ...b, id: b.id, code },
        barber: { id: b.barberId, name: b.barberName },
        shop,
      };
    },

    async cancel(code) {
      const { error } = await db.rpc('cancel_booking', { p_code: code });
      if (error) fail(error);
    },
  };
}
