import { formatDay } from './time.js';

// Mensagem que o cliente manda para a barbearia depois de agendar.
export function bookingMessage({ shopName, service, barber, date, time, name }) {
  return [
    `Olá, ${shopName}! Acabei de agendar pelo site:`,
    `${service.name} com ${barber.name}`,
    `${formatDay(date)} às ${time}`,
    `Nome: ${name}`,
  ].join('\n');
}

// Link oficial do WhatsApp (wa.me). O texto precisa ir codificado para acentos,
// quebras de linha e "&" não quebrarem o link.
export const whatsappLink = (phone, message) => `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
