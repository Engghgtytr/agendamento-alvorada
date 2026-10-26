import { describe, expect, it } from 'vitest';
import { parsePrice, slugify, validateDayRanges, validateService, validateTimeOff } from '../src/utils/admin-rules.js';
import { createDemoApi } from '../src/services/demo-api.js';
import { toInstant } from '../src/utils/time.js';

const SP = 'America/Sao_Paulo';
const NOW = toInstant('2026-10-26', '10:00', SP);

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}
const makeApi = () => createDemoApi({ now: () => NOW, storage: memoryStorage(), delayMs: 0 });

describe('regras do painel', () => {
  it('preço em reais vira centavos', () => {
    expect(parsePrice('45')).toBe(4500);
    expect(parsePrice('45,9')).toBe(4590);
    expect(parsePrice('R$ 1.200,50')).toBe(120050);
    expect(parsePrice('quarenta')).toBeNull();
    expect(parsePrice('4,555')).toBeNull();
  });

  it('nome do serviço vira um id sem acento', () => {
    expect(slugify('Corte + Barba Infantil')).toBe('corte-barba-infantil');
    expect(slugify('Hidratação')).toBe('hidratacao');
  });

  it('serviço: explica cada campo errado', () => {
    const ok = validateService({ name: 'Pigmentação', durationMin: 30, priceText: '40,00' });
    expect(ok.errors).toEqual({});
    expect(ok.value).toMatchObject({ priceCents: 4000, durationMin: 30 });
    const bad = validateService({ name: '', durationMin: 7, priceText: 'abc' });
    expect(Object.keys(bad.errors).sort()).toEqual(['durationMin', 'name', 'price']);
  });

  it('turnos do dia: fim depois do início e sem sobrepor', () => {
    expect(validateDayRanges([{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }])).toBeNull();
    expect(validateDayRanges([{ start: '', end: '' }])).toBeNull(); // dia de folga
    expect(validateDayRanges([{ start: '12:00', end: '09:00' }])).toMatch(/depois/);
    expect(validateDayRanges([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '15:00' }])).toMatch(/sobrep/);
    expect(validateDayRanges([{ start: '09:00', end: '' }])).toMatch(/início e fim/);
  });

  it('bloqueio: barbeiro, dia e horário', () => {
    expect(validateTimeOff({ barberId: 'caio', date: '2026-10-27', start: '12:00', end: '13:00' })).toEqual({});
    expect(validateTimeOff({ barberId: '', date: '', start: '13:00', end: '12:00' })).toMatchObject({
      barberId: expect.any(String),
      date: expect.any(String),
      end: expect.any(String),
    });
  });
});

describe('painel no modo demonstração', () => {
  it('mostra a agenda do dia com os clientes de exemplo e os marcados', async () => {
    const api = makeApi();
    const [slot] = await api.getSlots({ date: '2026-10-27', serviceId: 'corte', barberId: 'caio' });
    await api.book({ date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'caio', name: 'Ana', phone: '5511912345678' });
    const { appointments } = await api.admin.getDay('2026-10-27');
    expect(appointments.find((a) => a.name === 'Ana')).toMatchObject({ barberId: 'caio', time: slot.time });
    expect(appointments.some((a) => a.seed)).toBe(true);
  });

  it('marcar como atendido ou cancelar libera (ou não) o horário', async () => {
    const api = makeApi();
    const { appointments } = await api.admin.getDay('2026-10-27');
    const seed = appointments.find((a) => a.seed && a.barberId === 'caio');
    await api.admin.setStatus(seed.id, 'cancelled');
    const free = (await api.getSlots({ date: '2026-10-27', serviceId: 'sobrancelha', barberId: 'caio' })).map((s) => s.time);
    expect(free).toContain(seed.time);
    expect((await api.admin.getDay('2026-10-27')).appointments.find((a) => a.id === seed.id).status).toBe('cancelled');
  });

  it('bloqueio tira o horário da grade e pode ser desfeito', async () => {
    const api = makeApi();
    await api.admin.addTimeOff({ barberId: 'lia', date: '2026-10-28', start: '09:00', end: '18:00', reason: 'folga' });
    expect(await api.getSlots({ date: '2026-10-28', serviceId: 'corte', barberId: 'lia' })).toEqual([]);
    const { timeOff } = await api.admin.getDay('2026-10-28');
    expect(timeOff).toHaveLength(1);
    await api.admin.removeTimeOff(timeOff[0].id);
    expect((await api.getSlots({ date: '2026-10-28', serviceId: 'corte', barberId: 'lia' })).length).toBeGreaterThan(0);
  });

  it('serviço desativado some do site, mas continua no painel', async () => {
    const api = makeApi();
    await api.admin.saveService({ id: 'sobrancelha', active: false });
    expect((await api.getShop()).services.map((s) => s.id)).not.toContain('sobrancelha');
    expect((await api.admin.getShop()).services.find((s) => s.id === 'sobrancelha').active).toBe(false);
    await api.admin.saveService({ id: 'pigmentacao', name: 'Pigmentação', description: '', durationMin: 30, priceCents: 4000 });
    expect((await api.getShop()).services.map((s) => s.id)).toContain('pigmentacao');
  });

  it('expediente novo muda os dias abertos', async () => {
    const api = makeApi();
    await api.admin.saveHours('caio', [{ weekday: 1, start: '09:00', end: '12:00' }]); // passa a atender segunda
    const days = await api.getDays({ barberId: 'caio' });
    expect(days.find((d) => d.date === '2026-10-26').open).toBe(true); // segunda
    expect(days.find((d) => d.date === '2026-10-27').open).toBe(false); // terça, não mais
  });
});
