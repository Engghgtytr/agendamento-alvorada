// Modo demonstração: um "banco" no próprio navegador com as MESMAS regras do banco
// de verdade (horário duplicado, limite por WhatsApp, prazo para cancelar).
// Serve para qualquer pessoa testar o site, inclusive o painel do dono, sem configurar nada.

import { barbers, services as defaultServices, shop, workingHours as defaultHours } from '../data/demo-shop.js';
import { availableSlots, bookingDays, isActive, isOpenDay, overlaps, pickBarber } from '../utils/slots.js';
import { dateKey, fromMinutes, timeLabel, toInstant, toMinutes, weekdayOf } from '../utils/time.js';

const STORAGE_KEY = 'alvorada:demo:v1';

export class BookingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Código secreto do link "meu horário": 16 bytes aleatórios (128 bits).
export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Gerador de números "aleatórios" com semente: o mesmo dia sempre gera a mesma
// agenda ocupada, então a grade não muda a cada recarga.
function seededRandom(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

// Clientes de exemplo ocupando parte da agenda, para a grade parecer real.
// Não têm nome nem telefone: no painel aparecem como "Cliente de exemplo".
function seedDay(date) {
  const rand = seededRandom(`alvorada:${date}`);
  const weekday = weekdayOf(date);
  const result = [];
  for (const barber of barbers) {
    for (const range of defaultHours.filter((w) => w.barberId === barber.id && w.weekday === weekday)) {
      let m = toMinutes(range.start);
      const end = toMinutes(range.end);
      while (m < end) {
        const service = defaultServices[Math.floor(rand() * 3)];
        if (rand() < 0.27 && m + service.durationMin <= end) {
          const startsAt = toInstant(date, fromMinutes(m), shop.timezone);
          result.push({
            id: `seed-${date}-${barber.id}-${m}`,
            barberId: barber.id,
            serviceId: service.id,
            serviceName: service.name,
            priceCents: service.priceCents,
            durationMin: service.durationMin,
            date,
            time: fromMinutes(m),
            startsAt: startsAt.toISOString(),
            endsAt: new Date(+startsAt + service.durationMin * 60_000).toISOString(),
            name: null,
            phone: null,
            status: 'booked',
            seed: true,
          });
          m += Math.ceil(service.durationMin / shop.slotStepMin) * shop.slotStepMin;
        } else {
          m += shop.slotStepMin;
        }
      }
    }
  }
  return result;
}

// localStorage pode falhar (aba anônima, bloqueio). Aí os dados ficam só na memória.
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const emptyData = () => ({ v: 1, appointments: [], timeOff: [], seedStatus: {}, services: null, workingHours: null, nextId: 1 });

export function createDemoApi({ now = () => new Date(), storage = browserStorage(), delayMs = 300 } = {}) {
  let memory = emptyData();
  const seedCache = new Map();

  const load = () => {
    try {
      const data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
      if (data?.v === 1) memory = { ...emptyData(), ...data };
    } catch {
      // dado corrompido: segue com o que está na memória
    }
    return memory;
  };

  const save = (data) => {
    memory = data;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // sem espaço ou bloqueado: continua funcionando só nesta aba
    }
  };

  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());

  const allServices = () => load().services ?? defaultServices.map((s) => ({ ...s, active: true }));
  const activeServices = () => allServices().filter((s) => s.active !== false);
  const currentHours = () => load().workingHours ?? defaultHours;

  // Agendamentos de exemplo, com as mudanças de status que o dono fez no painel.
  const seedFor = (date) => {
    if (!seedCache.has(date)) seedCache.set(date, seedDay(date));
    const status = load().seedStatus;
    return seedCache.get(date).map((a) => (status[a.id] ? { ...a, status: status[a.id] } : a));
  };

  const appointmentsFor = (date) => [...seedFor(date), ...load().appointments];
  const timeOffList = () => load().timeOff;

  const findService = (id) => activeServices().find((s) => s.id === id);
  const findBarber = (id) => barbers.find((b) => b.id === id);
  const candidates = (barberId) => (barberId === 'any' ? barbers.map((b) => b.id) : [barberId]);

  function slotsFor({ date, serviceId, barberId }) {
    const service = findService(serviceId);
    if (!service) throw new BookingError('invalid', 'Serviço não encontrado.');
    return availableSlots({
      date,
      shop,
      service,
      barberIds: candidates(barberId),
      workingHours: currentHours(),
      timeOff: timeOffList(),
      appointments: appointmentsFor(date),
      now: now(),
    });
  }

  // ---------- Painel do dono (demonstração: sem senha, salva só neste navegador) ----------
  const admin = {
    async getShop() {
      return { shop, services: allServices(), barbers, workingHours: currentHours() };
    },

    async getDay(date) {
      await wait();
      const appointments = appointmentsFor(date)
        .filter((a) => dateKey(new Date(a.startsAt), shop.timezone) === date)
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      const timeOff = timeOffList().filter(
        (t) => dateKey(new Date(t.startsAt), shop.timezone) === date || dateKey(new Date(t.endsAt), shop.timezone) === date,
      );
      return { appointments, timeOff };
    },

    async setStatus(id, status) {
      await wait();
      if (!['booked', 'done', 'no_show', 'cancelled'].includes(status)) throw new BookingError('invalid', 'Status inválido.');
      const data = load();
      if (String(id).startsWith('seed-')) {
        data.seedStatus[id] = status;
      } else {
        const appt = data.appointments.find((a) => a.id === id);
        if (!appt) throw new BookingError('not_found', 'Agendamento não encontrado.');
        appt.status = status;
      }
      save(data);
    },

    async addTimeOff({ barberId, date, start, end, reason = '' }) {
      await wait();
      const data = load();
      data.timeOff.push({
        id: `t${data.nextId++}`,
        barberId,
        startsAt: toInstant(date, start, shop.timezone).toISOString(),
        endsAt: toInstant(date, end, shop.timezone).toISOString(),
        reason: String(reason).trim(),
      });
      save(data);
    },

    async removeTimeOff(id) {
      await wait();
      const data = load();
      data.timeOff = data.timeOff.filter((t) => t.id !== id);
      save(data);
    },

    async saveService(service) {
      await wait();
      const data = load();
      const list = allServices();
      const index = list.findIndex((s) => s.id === service.id);
      if (index >= 0) list[index] = { ...list[index], ...service };
      else list.push({ active: true, ...service });
      data.services = list;
      save(data);
    },

    // Troca todas as faixas de um barbeiro de uma vez.
    async saveHours(barberId, ranges) {
      await wait();
      const data = load();
      data.workingHours = [...currentHours().filter((w) => w.barberId !== barberId), ...ranges.map((r) => ({ ...r, barberId }))];
      save(data);
    },

    async reset() {
      save(emptyData());
      seedCache.clear();
    },
  };

  return {
    mode: 'demo',
    admin,

    async getShop() {
      return { shop, services: activeServices(), barbers, workingHours: currentHours() };
    },

    // Dias da janela, marcando quais a loja abre para o barbeiro escolhido.
    async getDays({ barberId = 'any' } = {}) {
      const ids = candidates(barberId);
      return bookingDays(shop, now()).map((date) => ({ date, open: isOpenDay(date, currentHours(), ids) }));
    },

    async getSlots(params) {
      await wait();
      return slotsFor(params);
    },

    async book({ date, time, serviceId, barberId, name, phone, website = '' }) {
      await wait();
      // Campo escondido preenchido = robô. Responde como se tivesse dado certo,
      // para ele não insistir, mas não grava nada.
      if (website) return { code: randomCode() };

      const service = findService(serviceId);
      if (!service || (barberId !== 'any' && !findBarber(barberId))) {
        throw new BookingError('invalid', 'Escolha o serviço e o barbeiro de novo.');
      }

      const data = load();
      const current = now();
      const activeForPhone = data.appointments.filter(
        (a) => a.phone === phone && isActive(a) && new Date(a.startsAt) > current,
      );
      if (activeForPhone.length >= shop.maxActivePerPhone) {
        throw new BookingError('limit', `Este WhatsApp já tem ${shop.maxActivePerPhone} horários marcados. Cancele um antes de marcar outro.`);
      }

      // Confere de novo na hora de gravar: alguém pode ter pegado o horário
      // enquanto a pessoa digitava o nome.
      const slot = slotsFor({ date, serviceId, barberId }).find((s) => s.time === time);
      if (!slot) throw new BookingError('slot_taken', 'Esse horário acabou de ser reservado. Escolha outro.');

      const chosen = barberId === 'any' ? pickBarber(slot.barberIds, date, appointmentsFor(date), shop.timezone) : barberId;

      // Última trava, igual à constraint do banco: nada sobreposto para o mesmo barbeiro.
      const clash = appointmentsFor(date).some(
        (a) => isActive(a) && a.barberId === chosen && overlaps(+slot.startsAt, +slot.endsAt, +new Date(a.startsAt), +new Date(a.endsAt)),
      );
      if (clash) throw new BookingError('slot_taken', 'Esse horário acabou de ser reservado. Escolha outro.');

      const code = randomCode();
      data.appointments.push({
        id: code.slice(0, 8),
        code,
        barberId: chosen,
        serviceId,
        serviceName: service.name,
        priceCents: service.priceCents,
        durationMin: service.durationMin,
        date,
        time: timeLabel(slot.startsAt, shop.timezone),
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        name,
        phone,
        status: 'booked',
        createdAt: current.toISOString(),
      });
      save(data);
      return { code };
    },

    async getBooking(code) {
      await wait();
      const appointment = load().appointments.find((a) => a.code === code);
      if (!appointment) return null;
      return { appointment, barber: findBarber(appointment.barberId), shop };
    },

    async cancel(code) {
      await wait();
      const data = load();
      const appointment = data.appointments.find((a) => a.code === code);
      if (!appointment) throw new BookingError('not_found', 'Não encontramos esse agendamento.');
      if (appointment.status === 'cancelled') return appointment;
      if (appointment.status !== 'booked') throw new BookingError('invalid', 'Esse horário já passou.');
      const minutesLeft = (new Date(appointment.startsAt) - now()) / 60_000;
      if (minutesLeft < shop.cancelLimitMin) {
        throw new BookingError('too_late', 'Faltam menos de 2 horas. Para cancelar agora, fale com a barbearia.');
      }
      appointment.status = 'cancelled';
      save(data);
      return appointment;
    },
  };
}
