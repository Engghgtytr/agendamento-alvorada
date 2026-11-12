// Modo pet shop na demonstração (?loja=pet): pet obrigatório, preço por porte, confirmar presença
// e marcações do dono. Mesmas regras do banco (004_pet_lembrete.sql).
import { describe, expect, it } from 'vitest';
import { createDemoApi } from '../src/services/demo-api.js';
import { toInstant } from '../src/utils/time.js';
import { priceText, reminderMessage } from '../src/utils/labels.js';

const NOW = toInstant('2026-10-26', '10:00', 'America/Sao_Paulo'); // segunda; terça 27 é dia de trabalho

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}
const makeApi = () => createDemoApi({ now: () => NOW, storage: memoryStorage(), delayMs: 0, loja: 'pet' });

async function bookPet(api, pet, phone = '5511912345678') {
  const [slot] = await api.getSlots({ date: '2026-10-27', serviceId: 'banho', barberId: 'bia' });
  return api.book({ date: '2026-10-27', time: slot.time, serviceId: 'banho', barberId: 'bia', name: 'Ana Souza', phone, pet });
}

describe('pet shop na demonstração', () => {
  it('é outra loja, com preço por porte', async () => {
    const { shop, services } = await makeApi().getShop();
    expect(shop.petMode).toBe(true);
    expect(priceText(services.find((s) => s.id === 'banho'))).toMatch(/^P R\$\s50,00 · M R\$\s65,00 · G R\$\s80,00$/);
  });

  it('cobra o preço do porte escolhido e guarda o pet', async () => {
    const api = makeApi();
    const { code } = await bookPet(api, { name: ' Thor ', size: 'g', breed: 'Golden' });
    const { appointment } = await api.getBooking(code);
    expect(appointment).toMatchObject({ petName: 'Thor', petSize: 'g', petBreed: 'Golden', priceCents: 8000 });
  });

  it('exige nome e porte do pet', async () => {
    const api = makeApi();
    await expect(bookPet(api, { name: '', size: 'p' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(bookPet(api, { name: 'Thor', size: 'gigante' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('o cliente confirma presença pelo link e o dono marca lembrete', async () => {
    const api = makeApi();
    const { code } = await bookPet(api, { name: 'Mel', size: 'p' });
    await api.confirm(code);
    const { appointment } = await api.getBooking(code);
    expect(appointment.confirmedAt).toBeTruthy();
    await api.admin.markReminded(appointment.id);
    const day = await api.admin.getDay('2026-10-27');
    expect(day.appointments.find((a) => a.id === appointment.id).remindedAt).toBeTruthy();
  });
});

describe('mensagem do lembrete', () => {
  it('fala do pet, do dia e da hora, e pede para responder SIM', () => {
    const text = reminderMessage({
      shop: { name: 'Bom Pelo', petMode: true },
      appointment: { name: 'Ana Souza', serviceName: 'Banho', petName: 'Thor', time: '14:00' },
      date: '2026-10-27',
    });
    expect(text).toContain('Oi, Ana!');
    expect(text).toContain('do banho do Thor');
    expect(text).toContain('às 14:00 aqui no pet shop Bom Pelo');
    expect(text).toContain('responder SIM');
  });
});
