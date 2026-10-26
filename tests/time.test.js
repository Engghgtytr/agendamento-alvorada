import { describe, expect, it } from 'vitest';
import { addDays, dateKey, formatDay, fromMinutes, timeLabel, toInstant, toMinutes, weekdayOf } from '../src/utils/time.js';

const SP = 'America/Sao_Paulo';

describe('fuso da loja', () => {
  it('14:30 em São Paulo é 17:30 em UTC (sem horário de verão desde 2019)', () => {
    expect(toInstant('2026-10-30', '14:30', SP).toISOString()).toBe('2026-10-30T17:30:00.000Z');
  });

  it('volta do instante para a data e a hora da loja', () => {
    const instant = new Date('2026-10-31T02:30:00Z'); // 23:30 do dia 30 em São Paulo
    expect(dateKey(instant, SP)).toBe('2026-10-30');
    expect(timeLabel(instant, SP)).toBe('23:30');
  });

  it('respeita horário de verão quando o fuso tem (Nova York)', () => {
    expect(toInstant('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(toInstant('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
});

describe('calendário', () => {
  it('vira o mês e o ano', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // ano bissexto
  });

  it('sabe o dia da semana', () => {
    expect(weekdayOf('2026-10-26')).toBe(1); // segunda
    expect(weekdayOf('2026-11-01')).toBe(0); // domingo
  });

  it('converte minutos e formata o dia', () => {
    expect(toMinutes('13:45')).toBe(825);
    expect(fromMinutes(825)).toBe('13:45');
    expect(formatDay('2026-10-30')).toBe('sexta-feira, 30/10');
  });
});
