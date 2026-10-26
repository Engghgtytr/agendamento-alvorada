import { describe, expect, it } from 'vitest';
import { createDemoApi } from '../src/services/demo-api.js';
import { toInstant } from '../src/utils/time.js';

const SP = 'America/Sao_Paulo';
// "Agora" fixo: segunda 26/10/2026 às 10h. Terça 27 é dia de trabalho.
const NOW = toInstant('2026-10-26', '10:00', SP);

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

const makeApi = (now = NOW, storage = memoryStorage()) => createDemoApi({ now: () => now, storage, delayMs: 0 });
const customer = { name: 'Ana', phone: '5511912345678' };

async function firstFree(api, barberId = 'caio', serviceId = 'corte') {
  const slots = await api.getSlots({ date: '2026-10-27', serviceId, barberId });
  return slots[0];
}

describe('agendar no modo demonstração', () => {
  it('marca um horário e ele some da grade', async () => {
    const api = makeApi();
    const slot = await firstFree(api);
    const { code } = await api.book({ date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'caio', ...customer });
    expect(code).toMatch(/^[\w-]{22}$/);
    const after = await api.getSlots({ date: '2026-10-27', serviceId: 'corte', barberId: 'caio' });
    expect(after.map((s) => s.time)).not.toContain(slot.time);
  });

  it('dois clientes no mesmo horário: só o primeiro consegue', async () => {
    const api = makeApi();
    const slot = await firstFree(api);
    const booking = { date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'caio' };
    const results = await Promise.allSettled([
      api.book({ ...booking, name: 'Ana', phone: '5511911111111' }),
      api.book({ ...booking, name: 'Bia', phone: '5511922222222' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe('slot_taken');
  });

  it('"qualquer um" escolhe um barbeiro livre de verdade', async () => {
    const api = makeApi();
    const slot = await firstFree(api, 'any');
    const { code } = await api.book({ date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'any', ...customer });
    const { appointment } = await api.getBooking(code);
    expect(slot.barberIds).toContain(appointment.barberId);
  });

  it('no máximo 2 horários futuros por WhatsApp', async () => {
    const api = makeApi();
    const slots = await api.getSlots({ date: '2026-10-27', serviceId: 'sobrancelha', barberId: 'any' });
    const book = (time) => api.book({ date: '2026-10-27', time, serviceId: 'sobrancelha', barberId: 'any', ...customer });
    await book(slots[0].time);
    await book(slots.at(-1).time);
    await expect(book(slots[5].time)).rejects.toMatchObject({ code: 'limit' });
  });

  it('robô que preenche o campo escondido não grava nada', async () => {
    const api = makeApi();
    const slot = await firstFree(api);
    const { code } = await api.book({ date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'caio', ...customer, website: 'spam' });
    expect(await api.getBooking(code)).toBeNull();
  });

  it('serviço inexistente é recusado', async () => {
    const api = makeApi();
    await expect(api.book({ date: '2026-10-27', time: '09:00', serviceId: 'tatuagem', barberId: 'caio', ...customer })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('cancelar pelo link', () => {
  it('cancela com antecedência e o horário volta para a grade', async () => {
    const api = makeApi();
    const slot = await firstFree(api);
    const { code } = await api.book({ date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'caio', ...customer });
    const cancelled = await api.cancel(code);
    expect(cancelled.status).toBe('cancelled');
    const again = await firstFree(api);
    expect(again.time).toBe(slot.time);
  });

  it('com menos de 2 horas, pede para falar com a barbearia', async () => {
    const storage = memoryStorage();
    const slot = await firstFree(makeApi(NOW, storage));
    const { code } = await makeApi(NOW, storage).book({ date: '2026-10-27', time: slot.time, serviceId: 'corte', barberId: 'caio', ...customer });
    const quaseLa = new Date(+slot.startsAt - 90 * 60_000);
    await expect(makeApi(quaseLa, storage).cancel(code)).rejects.toMatchObject({ code: 'too_late' });
  });

  it('código errado não acha nada', async () => {
    const api = makeApi();
    expect(await api.getBooking('nao-existe')).toBeNull();
    await expect(api.cancel('nao-existe')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('agenda de demonstração', () => {
  it('a mesma data gera sempre a mesma grade (não muda a cada recarga)', async () => {
    const a = await makeApi().getSlots({ date: '2026-10-28', serviceId: 'corte', barberId: 'any' });
    const b = await makeApi().getSlots({ date: '2026-10-28', serviceId: 'corte', barberId: 'any' });
    expect(a.map((s) => s.time)).toEqual(b.map((s) => s.time));
    expect(a.length).toBeGreaterThan(5);
  });

  it('domingo e segunda a loja não abre', async () => {
    const days = await makeApi().getDays();
    expect(days.find((d) => d.date === '2026-10-26').open).toBe(false); // segunda
    expect(days.find((d) => d.date === '2026-11-01').open).toBe(false); // domingo
    expect(days.find((d) => d.date === '2026-10-27').open).toBe(true);
  });
});
