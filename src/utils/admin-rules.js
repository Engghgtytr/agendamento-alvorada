// Validação do que o dono digita no painel. As mesmas regras existem no banco
// (checks e funções da migration 001); aqui elas servem para mostrar o erro no
// campo certo antes de enviar.
import { toMinutes } from './time.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// "45" ou "45,90" ou "R$ 45,90" → 4590 centavos
export function parsePrice(raw) {
  const clean = String(raw ?? '').replace(/[R$\s.]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function validateService({ name, description = '', durationMin, priceText }) {
  const errors = {};
  const n = String(name ?? '').trim();
  if (!n) errors.name = 'Escreva o nome do serviço.';
  else if (n.length > 60) errors.name = 'Use até 60 caracteres.';
  if (String(description).trim().length > 200) errors.description = 'Use até 200 caracteres.';
  const d = Number(durationMin);
  if (!Number.isInteger(d) || d < 5 || d > 480 || d % 5) errors.durationMin = 'Escolha uma duração entre 5 min e 8 h.';
  const price = parsePrice(priceText);
  if (price === null) errors.price = 'Escreva o preço assim: 45,00.';
  else if (price > 1_000_000) errors.price = 'Preço alto demais.';
  return { errors, value: { name: n, description: String(description).trim(), durationMin: d, priceCents: price } };
}

// ranges: [{ start: '09:00', end: '12:00' }, …] de um dia da semana.
export function validateDayRanges(ranges) {
  const filled = ranges.filter((r) => r.start || r.end);
  for (const r of filled) {
    if (!TIME.test(r.start ?? '') || !TIME.test(r.end ?? '')) return 'Preencha início e fim (ex.: 09:00).';
    if (toMinutes(r.start) >= toMinutes(r.end)) return 'O fim precisa ser depois do início.';
  }
  const sorted = [...filled].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return 'Os dois turnos se sobrepõem.';
  }
  return null;
}

export function validateTimeOff({ barberId, date, start, end, reason = '' }) {
  const errors = {};
  if (!barberId) errors.barberId = 'Escolha o barbeiro.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) errors.date = 'Escolha o dia.';
  if (!TIME.test(start ?? '')) errors.start = 'Escolha o início.';
  if (!TIME.test(end ?? '')) errors.end = 'Escolha o fim.';
  else if (!errors.start && toMinutes(start) >= toMinutes(end)) errors.end = 'O fim precisa ser depois do início.';
  if (String(reason).trim().length > 100) errors.reason = 'Use até 100 caracteres.';
  return errors;
}
