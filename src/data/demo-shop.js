// Dados da Barbearia Alvorada, que é FICTÍCIA: nomes, preços e horários servem só
// para demonstrar o sistema. No modo com Supabase, tudo isto vem do banco.

export const shop = {
  name: 'Barbearia Alvorada',
  whatsapp: null, // loja fictícia: sem número, para nunca mandar mensagem a uma pessoa real
  timezone: 'America/Sao_Paulo',
  slotStepMin: 15, // a grade de horários anda de 15 em 15 minutos
  minNoticeMin: 60, // não dá para marcar para daqui a menos de 1 hora
  windowDays: 21, // dá para marcar até 3 semanas para a frente
  cancelLimitMin: 120, // cancelar pelo link só até 2 horas antes
  maxActivePerPhone: 2, // no máximo 2 horários futuros por WhatsApp (evita abuso)
};

export const services = [
  { id: 'corte', name: 'Corte', description: 'Tesoura ou máquina, com lavagem e finalização.', durationMin: 40, priceCents: 4500 },
  { id: 'barba', name: 'Barba', description: 'Toalha quente, navalha e balm.', durationMin: 30, priceCents: 3500 },
  { id: 'corte-barba', name: 'Corte + barba', description: 'Os dois juntos, numa sessão só.', durationMin: 70, priceCents: 7500 },
  { id: 'acabamento', name: 'Acabamento', description: 'Pezinho e contorno entre um corte e outro.', durationMin: 20, priceCents: 2000 },
  { id: 'sobrancelha', name: 'Sobrancelha', description: 'Limpeza na navalha ou na pinça.', durationMin: 15, priceCents: 1500 },
];

export const barbers = [
  { id: 'caio', name: 'Caio', specialty: 'Degradê e corte na máquina' },
  { id: 'rafa', name: 'Rafa', specialty: 'Barba na navalha e toalha quente' },
  { id: 'lia', name: 'Lia', specialty: 'Corte na tesoura e cabelo comprido' },
];

// Expediente de cada barbeiro. 0 = domingo … 6 = sábado.
// Duas faixas no mesmo dia = intervalo de almoço no meio.
const range = (barberId, weekdays, start, end) => weekdays.map((weekday) => ({ barberId, weekday, start, end }));

export const workingHours = [
  ...range('caio', [2, 3, 4, 5], '09:00', '12:00'),
  ...range('caio', [2, 3, 4, 5], '13:00', '19:00'),
  ...range('caio', [6], '08:00', '14:00'),

  ...range('rafa', [2, 3, 4, 5], '10:00', '13:00'),
  ...range('rafa', [2, 3, 4, 5], '14:00', '20:00'),
  ...range('rafa', [6], '08:00', '14:00'),

  ...range('lia', [3, 4, 5], '09:00', '12:30'),
  ...range('lia', [3, 4, 5], '13:30', '18:00'),
  ...range('lia', [6], '08:00', '14:00'),
];
