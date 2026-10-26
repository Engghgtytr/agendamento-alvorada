// Datas e horas sempre no fuso da barbearia, não no fuso de quem abre o site.
// Uma pessoa em Lisboa que marca "14:30" está marcando 14:30 em São Paulo.
//
// Formatos usados no projeto:
//   data  'AAAA-MM-DD'  (dia do calendário da loja)
//   hora  'HH:MM'       (relógio da loja)
//   instante            Date (um ponto exato no tempo, igual no mundo todo)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map();

function partsIn(date, timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, fmt);
  }
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

const pad = (n) => String(n).padStart(2, '0');

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (total) => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;

// Dia do calendário da loja em que um instante cai.
export function dateKey(date, timeZone) {
  const p = partsIn(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Hora do relógio da loja em que um instante cai.
export function timeLabel(date, timeZone) {
  const p = partsIn(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// Dia da semana de uma data (0 = domingo). Não depende de fuso.
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

// "Dia 31/10 às 14:30 em São Paulo" vira o instante certo, mesmo com horário de
// verão: calcula a diferença do fuso naquele momento e confere de novo.
export function toInstant(dateStr, hhmm, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  const offsetAt = (t) => {
    const p = partsIn(new Date(t), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  let t = wall - offsetAt(wall);
  const again = offsetAt(t);
  if (wall - again !== t) t = wall - again;
  return new Date(t);
}

const dayFormat = new Map();

// "sexta, 31/10"
export function formatDay(dateStr, { weekday = 'long' } = {}) {
  const key = weekday;
  let fmt = dayFormat.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday, day: '2-digit', month: '2-digit' });
    dayFormat.set(key, fmt);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return fmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export const weekdayShort = (dateStr) => WEEKDAY_SHORT[weekdayOf(dateStr)];
export const weekdayLong = (dateStr) => WEEKDAY_LONG[weekdayOf(dateStr)];
export const dayOfMonth = (dateStr) => Number(dateStr.slice(8, 10));
