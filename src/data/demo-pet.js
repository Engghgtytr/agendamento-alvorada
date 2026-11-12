// Pet shop FICTÍCIO para demonstrar o modo pet (abra o site com ?loja=pet).
// Mesmo formato de demo-shop.js; nomes, preços e horários servem só para a demonstração.

export const shop = {
  name: 'Banho & Tosa Bom Pelo',
  lead: 'Banho e tosa de terça a sábado. Escolha o horário aqui, sem ligar e sem criar conta.',
  petMode: true,
  whatsapp: null, // loja fictícia: sem número, para nunca mandar mensagem a uma pessoa real
  timezone: 'America/Sao_Paulo',
  slotStepMin: 15,
  minNoticeMin: 60,
  windowDays: 21,
  cancelLimitMin: 120,
  maxActivePerPhone: 2,
};

export const services = [
  { id: 'banho', name: 'Banho', description: 'Shampoo neutro, secagem e perfume.', durationMin: 60, priceCents: 5000, sizePrices: { p: 5000, m: 6500, g: 8000 } },
  { id: 'banho-tosa', name: 'Banho e tosa', description: 'Banho completo e tosa na máquina ou na tesoura.', durationMin: 90, priceCents: 8000, sizePrices: { p: 8000, m: 10000, g: 13000 } },
  { id: 'tosa-higienica', name: 'Tosa higiênica', description: 'Patas, barriga e região íntima.', durationMin: 30, priceCents: 4000, sizePrices: { p: 4000, m: 5000, g: 6000 } },
  { id: 'hidratacao', name: 'Hidratação', description: 'Máscara para pelo ressecado, junto com o banho.', durationMin: 30, priceCents: 3500 },
  { id: 'unhas', name: 'Corte de unhas', description: 'Rápido, com lixa.', durationMin: 15, priceCents: 2000 },
];

export const barbers = [
  { id: 'bia', name: 'Bia', specialty: 'Banho e secagem' },
  { id: 'duda', name: 'Duda', specialty: 'Tosa na tesoura' },
];

const range = (barberId, weekdays, start, end) => weekdays.map((weekday) => ({ barberId, weekday, start, end }));

export const workingHours = [
  ...range('bia', [2, 3, 4, 5], '09:00', '12:00'),
  ...range('bia', [2, 3, 4, 5], '13:00', '18:00'),
  ...range('bia', [6], '08:00', '14:00'),
  ...range('duda', [2, 3, 4, 5, 6], '10:00', '13:00'),
  ...range('duda', [2, 3, 4, 5], '14:00', '19:00'),
];
