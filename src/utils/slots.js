import { addDays, dateKey, fromMinutes, timeLabel, toInstant, toMinutes, weekdayOf } from './time.js';

// Dois intervalos [início, fim) se sobrepõem quando um começa antes do outro acabar.
// 14:00–14:40 e 14:40–15:10 NÃO se sobrepõem: um termina exatamente quando o outro começa.
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Só agendamentos marcados ocupam a agenda. Cancelado, atendido e faltou liberam
// (atendido e faltou já passaram, não importam para horários futuros).
export const isActive = (appointment) => appointment.status === 'booked';

// Dias que aparecem para o cliente: de hoje até o fim da janela de agendamento.
export function bookingDays(shop, now) {
  const today = dateKey(now, shop.timezone);
  return Array.from({ length: shop.windowDays }, (_, i) => addDays(today, i));
}

export function isBookableDate(date, shop, now) {
  const days = bookingDays(shop, now);
  return date >= days[0] && date <= days[days.length - 1];
}

// A loja abre neste dia? (pelo menos um barbeiro com expediente)
export function isOpenDay(date, workingHours, barberIds) {
  const weekday = weekdayOf(date);
  return workingHours.some((w) => w.weekday === weekday && barberIds.includes(w.barberId));
}

function busyByBarber(timeOff, appointments) {
  const map = new Map();
  const add = (barberId, startsAt, endsAt) => {
    if (!map.has(barberId)) map.set(barberId, []);
    map.get(barberId).push([+new Date(startsAt), +new Date(endsAt)]);
  };
  for (const t of timeOff) add(t.barberId, t.startsAt, t.endsAt);
  for (const a of appointments) if (isActive(a)) add(a.barberId, a.startsAt, a.endsAt);
  return map;
}

/**
 * Horários livres de um dia para um serviço.
 *
 * Um horário é livre para um barbeiro quando:
 *  - o atendimento inteiro (início + duração) cabe numa faixa do expediente dele;
 *  - começa num múltiplo da grade (ex.: de 15 em 15 minutos) a partir do início da faixa;
 *  - não encosta em nenhum bloqueio nem agendamento ativo dele;
 *  - começa depois de agora + antecedência mínima;
 *  - o dia está dentro da janela de agendamento.
 *
 * Devolve [{ time, startsAt, endsAt, barberIds }] em ordem de horário.
 * Com vários barbeiros, um horário aparece uma vez com a lista de quem está livre.
 */
export function availableSlots({ date, shop, service, barberIds, workingHours, timeOff = [], appointments = [], now }) {
  if (!isBookableDate(date, shop, now)) return [];

  const weekday = weekdayOf(date);
  const durationMs = service.durationMin * 60_000;
  const earliest = +now + shop.minNoticeMin * 60_000;
  const busy = busyByBarber(timeOff, appointments);
  const slots = new Map();

  for (const barberId of barberIds) {
    const ranges = workingHours.filter((w) => w.barberId === barberId && w.weekday === weekday);
    const taken = busy.get(barberId) ?? [];

    for (const range of ranges) {
      const end = toMinutes(range.end);
      for (let m = toMinutes(range.start); m + service.durationMin <= end; m += shop.slotStepMin) {
        const time = fromMinutes(m);
        const startsAt = toInstant(date, time, shop.timezone);
        const start = +startsAt;
        if (start < earliest) continue;
        if (taken.some(([s, e]) => overlaps(start, start + durationMs, s, e))) continue;

        const slot = slots.get(time) ?? { time, startsAt, endsAt: new Date(start + durationMs), barberIds: [] };
        slot.barberIds.push(barberId);
        slots.set(time, slot);
      }
    }
  }

  return [...slots.values()].sort((a, b) => a.startsAt - b.startsAt);
}

// "Qualquer um disponível": fica com quem tem a agenda mais vazia no dia.
// Empate: a ordem da equipe (barberIds já vem nessa ordem).
export function pickBarber(barberIds, date, appointments, timeZone) {
  const countOf = (id) =>
    appointments.filter((a) => isActive(a) && a.barberId === id && dateKey(new Date(a.startsAt), timeZone) === date).length;
  return [...barberIds].sort((a, b) => countOf(a) - countOf(b) || barberIds.indexOf(a) - barberIds.indexOf(b))[0];
}

// Separa a grade em manhã, tarde e noite, pelo relógio da loja.
export function groupByPeriod(slots, timeZone) {
  const groups = { manha: [], tarde: [], noite: [] };
  for (const slot of slots) {
    const minutes = toMinutes(timeLabel(slot.startsAt, timeZone));
    if (minutes < 12 * 60) groups.manha.push(slot);
    else if (minutes < 18 * 60) groups.tarde.push(slot);
    else groups.noite.push(slot);
  }
  return groups;
}
