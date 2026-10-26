// Validação dos dados do cliente. Só pedimos o mínimo (LGPD): nome e WhatsApp.

export const NAME_MAX = 60;

export function validateName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Escreva seu nome.' };
  if (name.length < 2) return { error: 'O nome precisa ter pelo menos 2 letras.' };
  if (name.length > NAME_MAX) return { error: `Use até ${NAME_MAX} caracteres.` };
  if (!/\p{L}/u.test(name)) return { error: 'Escreva seu nome com letras.' };
  return { value: name };
}

// Aceita "(11) 91234-5678", "11912345678" ou "+55 11 91234-5678".
// Devolve só números com o 55 do Brasil na frente: 5511912345678.
export function validatePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return { error: 'Escreva seu WhatsApp com DDD.' };
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length < 10) return { error: 'Faltou o DDD ou algum número. Ex.: (11) 91234-5678.' };
  if (digits.length > 11) return { error: 'Número comprido demais. Ex.: (11) 91234-5678.' };
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return { error: 'O DDD parece errado. Ex.: (11) 91234-5678.' };
  if (digits.length === 11 && digits[2] !== '9') return { error: 'Celular com 11 números começa com 9 depois do DDD.' };
  return { value: `55${digits}` };
}

// 5511912345678 → (11) 91234-5678
export function formatPhone(value) {
  const d = String(value).replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

export const firstName = (name) => String(name).trim().split(/\s+/)[0];
