// Confere a "tradução" entre o banco e as telas, com o Supabase simulado.
// (As regras em si são testadas no banco de verdade em database.test.js.)
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const tables = {
  shop_settings: { name: 'Barbearia Alvorada', whatsapp: null, timezone: 'America/Sao_Paulo', slot_step_min: 15, min_notice_min: 60, window_days: 21, cancel_limit_min: 120, max_active_per_phone: 2 },
  services: [{ id: 'corte', name: 'Corte', description: '', duration_min: 40, price_cents: 4500 }],
  barbers: [{ id: 'caio', name: 'Caio', specialty: '' }],
  working_hours: [{ barber_id: 'caio', weekday: 2, start_time: '09:00:00', end_time: '12:00:00' }],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc,
    from: (table) => {
      const result = { data: tables[table], error: null };
      const chain = { select: () => chain, order: () => chain, single: () => result, then: (r) => r(result) };
      return chain;
    },
  }),
}));

const { createSupabaseApi } = await import('../src/services/supabase-api.js');

describe('API com Supabase', () => {
  beforeEach(() => rpc.mockReset());

  it('converte a loja e o expediente para o formato das telas', async () => {
    const { shop, workingHours, services } = await createSupabaseApi('https://x.supabase.co', 'k').getShop();
    expect(shop).toMatchObject({ slotStepMin: 15, windowDays: 21, maxActivePerPhone: 2 });
    expect(workingHours[0]).toEqual({ barberId: 'caio', weekday: 2, start: '09:00', end: '12:00' });
    expect(services[0]).toMatchObject({ durationMin: 40, priceCents: 4500 });
  });

  it('"qualquer um" vira barbeiro nulo e a grade vem com datas', async () => {
    rpc.mockResolvedValue({ data: [{ slot_time: '09:00', starts_at: '2026-10-27T12:00:00+00:00', ends_at: '2026-10-27T12:40:00+00:00', barber_ids: ['caio'] }], error: null });
    const api = createSupabaseApi('https://x.supabase.co', 'k');
    const [slot] = await api.getSlots({ date: '2026-10-27', serviceId: 'corte', barberId: 'any' });
    expect(rpc).toHaveBeenCalledWith('available_slots', { p_date: '2026-10-27', p_service_id: 'corte', p_barber_id: null });
    expect(slot).toMatchObject({ time: '09:00', barberIds: ['caio'] });
    expect(slot.startsAt.toISOString()).toBe('2026-10-27T12:00:00.000Z');
  });

  it('erro do banco vira mensagem para a pessoa, sem detalhe técnico', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'slot_taken', hint: 'Esse horário acabou de ser reservado. Escolha outro.' } });
    const api = createSupabaseApi('https://x.supabase.co', 'k');
    await expect(api.book({ date: '2026-10-27', time: '09:00', serviceId: 'corte', barberId: 'caio', name: 'Ana', phone: '5511912345678' }))
      .rejects.toMatchObject({ code: 'slot_taken', message: 'Esse horário acabou de ser reservado. Escolha outro.' });
  });

  it('erro desconhecido não é disfarçado de "horário ocupado"', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const api = createSupabaseApi('https://x.supabase.co', 'k');
    await expect(api.cancel('a'.repeat(64))).rejects.toMatchObject({ message: 'network down' });
  });

  it('robô (campo escondido) não chega a chamar o banco', async () => {
    const api = createSupabaseApi('https://x.supabase.co', 'k');
    await api.book({ date: '2026-10-27', time: '09:00', serviceId: 'corte', barberId: 'caio', name: 'Ana', phone: '5511912345678', website: 'spam' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
