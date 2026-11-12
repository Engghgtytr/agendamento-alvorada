// Palavras e regras que mudam com o tipo de loja (barbearia ou pet shop) e o preço por porte.
import { formatMoney } from './format.js';
import { formatDay } from './time.js';

export const labels = (shop) =>
  shop?.petMode
    ? { staff: 'Profissional', staffPlural: 'profissionais', place: 'no pet shop', to: 'o pet shop' }
    : { staff: 'Barbeiro', staffPlural: 'barbeiros', place: 'na barbearia', to: 'a barbearia' };

export const SIZES = { p: 'Pequeno', m: 'Médio', g: 'Grande' };

/** Preço do serviço para um porte (sem preço por porte, vale o preço normal). */
export const sizePrice = (service, size) => service.sizePrices?.[size] ?? service.priceCents;

/** Texto do preço na lista: "P R$ 50 · M R$ 65 · G R$ 80" ou o preço único. */
export const priceText = (service) =>
  service.sizePrices
    ? Object.keys(SIZES)
        .filter((k) => service.sizePrices[k] != null)
        .map((k) => `${k.toUpperCase()} ${formatMoney(service.sizePrices[k])}`)
        .join(' · ')
    : formatMoney(service.priceCents);

/** Mensagem do lembrete que o dono manda com um toque. */
export function reminderMessage({ shop, appointment: a, date }) {
  const first = String(a.name ?? '').split(' ')[0];
  const what = a.petName ? `do ${a.serviceName.toLowerCase()} do ${a.petName}` : `do seu horário de ${a.serviceName.toLowerCase()}`;
  return `Oi, ${first}! 😊 Passando para lembrar ${what} ${formatDay(date)} às ${a.time} aqui ${labels(shop).place} ${shop.name}.\n\nPode confirmar? É só responder SIM. Se precisar remarcar, me avisa por aqui.`;
}
