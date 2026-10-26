// Arquivo .ics: o formato que Google Agenda, iPhone e Outlook entendem.
// Abrir o arquivo no celular cria o evento na agenda da pessoa, com lembrete.

const stamp = (date) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// Vírgula, ponto e vírgula, barra invertida e quebra de linha têm significado no .ics.
const text = (value) =>
  String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs({ uid, startsAt, endsAt, summary, description, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Penchel.Dev//Agendamento Alvorada//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${text(summary)}`,
    `DESCRIPTION:${text(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(summary)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // O padrão pede fim de linha CRLF.
  return `${lines.join('\r\n')}\r\n`;
}
