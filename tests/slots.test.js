import { describe, expect, it } from 'vitest';
import { availableSlots, bookingDays, groupByPeriod, isOpenDay, overlaps, pickBarber } from '../src/utils/slots.js';
import { toInstant } from '../src/utils/time.js';

const SP = 'America/Sao_Paulo';
const shop = { timezone: SP, slotStepMin: 15, minNoticeMin: 60, windowDays: 21 };
const corte = { durationMin: 40 };
// Terça 27/10/2026. "Agora" = segunda 26/10 às 10h, para o dia estar todo no futuro.
const DATE = '2026-10-27';
const NOW = toInstant('2026-10-26', '10:00', SP);

const hours = [
  { barberId: 'caio', weekday: 2, start: '09:00', end: '12:00' },
  { barberId: 'caio', weekday: 2, start: '13:00', end: '15:00' },
  { barberId: 'rafa', weekday: 2, start: '10:00', end: '11:00' },
];

const booked = (barberId, start, end, status = 'booked') => ({
  barberId,
  startsAt: toInstant(DATE, start, SP),
  endsAt: toInstant(DATE, end, SP),
  status,
});

const times = (slots) => slots.map((s) => s.time);
const base = { date: DATE, shop, service: corte, barberIds: ['caio'], workingHours: hours, now: NOW };

describe('sobreposição', () => {
  it('horários que só encostam não se sobrepõem', () => {
    expect(overlaps(0, 40, 40, 70)).toBe(false);
    expect(overlaps(0, 40, 39, 70)).toBe(true);
    expect(overlaps(10, 20, 0, 100)).toBe(true); // um dentro do outro
  });
});

describe('horários livres', () => {
  it('o atendimento inteiro precisa caber no expediente (e no almoço não)', () => {
    const slots = times(availableSlots(base));
    expect(slots[0]).toBe('09:00');
    expect(slots).toContain('11:15'); // 11:15 + 40 min = 11:55
    expect(slots).not.toContain('11:30'); // terminaria 12:10, no almoço
    expect(slots).not.toContain('12:00');
    expect(slots).toContain('13:00');
    expect(slots.at(-1)).toBe('14:15'); // 14:15 + 40 = 14:55
  });

  it('um agendamento bloqueia tudo que encostaria nele, mas libera quem só encosta', () => {
    const slots = times(availableSlots({ ...base, appointments: [booked('caio', '10:00', '10:40')] }));
    expect(slots).toContain('09:15'); // 09:15–09:55
    expect(slots).not.toContain('09:30'); // 09:30–10:10 bateria no das 10:00
    expect(slots).not.toContain('10:15');
    expect(slots).toContain('10:45'); // começa depois que o outro acaba
  });

  it('cancelado não ocupa a agenda', () => {
    const slots = times(availableSlots({ ...base, appointments: [booked('caio', '10:00', '10:40', 'cancelled')] }));
    expect(slots).toContain('10:00');
  });

  it('bloqueio do dono (folga, médico) tira os horários', () => {
    const timeOff = [{ barberId: 'caio', startsAt: toInstant(DATE, '13:00', SP), endsAt: toInstant(DATE, '15:00', SP) }];
    const slots = times(availableSlots({ ...base, timeOff }));
    expect(slots.some((t) => t >= '13:00')).toBe(false);
  });

  it('respeita a antecedência mínima de 1 hora', () => {
    const now = toInstant(DATE, '10:05', SP);
    const slots = times(availableSlots({ ...base, now }));
    expect(slots[0]).toBe('11:15'); // 11:05 é o mínimo; a grade anda de 15 em 15
  });

  it('não mostra dia fora da janela nem dia que já passou', () => {
    expect(availableSlots({ ...base, date: '2026-10-20' })).toEqual([]);
    expect(availableSlots({ ...base, date: '2026-11-24' })).toEqual([]); // 29 dias depois
  });

  it('com dois barbeiros, junta o horário e diz quem está livre', () => {
    const slots = availableSlots({ ...base, barberIds: ['caio', 'rafa'] });
    const dez = slots.find((s) => s.time === '10:00');
    expect(dez.barberIds).toEqual(['caio', 'rafa']);
    const nove = slots.find((s) => s.time === '09:00');
    expect(nove.barberIds).toEqual(['caio']);
  });

  it('serviço maior que a faixa não aparece', () => {
    const slots = availableSlots({ ...base, barberIds: ['rafa'], service: { durationMin: 70 } });
    expect(slots).toEqual([]); // Rafa tem só 1 hora nesse dia
  });
});

describe('qualquer um disponível', () => {
  it('escolhe quem tem a agenda mais vazia; empate fica com a ordem da equipe', () => {
    const appts = [booked('caio', '09:00', '09:40'), booked('caio', '13:00', '13:40'), booked('rafa', '10:00', '10:40')];
    expect(pickBarber(['caio', 'rafa'], DATE, appts, SP)).toBe('rafa');
    expect(pickBarber(['caio', 'rafa'], DATE, [], SP)).toBe('caio');
  });
});

describe('dias e períodos', () => {
  it('lista 21 dias a partir de hoje e sabe quais a loja abre', () => {
    const days = bookingDays(shop, NOW);
    expect(days).toHaveLength(21);
    expect(days[0]).toBe('2026-10-26');
    expect(isOpenDay('2026-10-27', hours, ['caio'])).toBe(true);
    expect(isOpenDay('2026-10-26', hours, ['caio'])).toBe(false); // segunda
  });

  it('separa manhã, tarde e noite', () => {
    const groups = groupByPeriod(availableSlots(base), SP);
    expect(groups.manha[0].time).toBe('09:00');
    expect(groups.tarde[0].time).toBe('13:00');
    expect(groups.noite).toEqual([]);
  });
});
