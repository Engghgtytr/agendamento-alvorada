import { siteFooter, siteHeader, icons } from '../components/layout.js';
import { api } from '../services/api.js';
import { saveWizard } from '../services/wizard-state.js';
import { esc, formatDuration, formatMoney } from '../utils/format.js';
import { dateKey, formatDay, fromMinutes, toMinutes, addDays } from '../utils/time.js';

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HERO_SERVICE = 'corte';

// Horário de funcionamento por dia da semana: do primeiro barbeiro que chega
// ao último que sai.
function openingHours(workingHours) {
  return WEEKDAY_NAMES.map((name, weekday) => {
    const ranges = workingHours.filter((w) => w.weekday === weekday);
    if (!ranges.length) return { name, label: 'Fechado' };
    const start = Math.min(...ranges.map((r) => toMinutes(r.start)));
    const end = Math.max(...ranges.map((r) => toMinutes(r.end)));
    return { name, label: `${fromMinutes(start)} às ${fromMinutes(end)}` };
  });
}

function daysOf(barberId, workingHours) {
  const days = [...new Set(workingHours.filter((w) => w.barberId === barberId).map((w) => w.weekday))].sort();
  const short = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  // Dias seguidos viram faixa: ter a sáb
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (consecutive && days.length > 2) return `${short[days[0]]} a ${short[days.at(-1)]}`;
  return days.map((d) => short[d]).join(', ');
}

function relativeDay(date, today) {
  if (date === today) return 'Hoje';
  if (date === addDays(today, 1)) return 'Amanhã';
  const label = formatDay(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function renderHome(app) {
  app.innerHTML = `
    ${siteHeader()}
    <main id="conteudo">
      <section class="hero">
        <div class="wrap hero__grid">
          <div class="hero__text">
            <h1>Barbearia Alvorada</h1>
            <p class="hero__lead">Corte e barba de terça a sábado. Escolha o horário aqui, sem ligar e sem criar conta.</p>
            <div class="hero__actions">
              <a class="btn btn--sol" href="#/agendar">Agendar horário</a>
              <a class="btn hero__ghost" href="#servicos">Ver serviços e preços</a>
            </div>
          </div>

          <aside class="next" aria-labelledby="next-title">
            <p class="next__label">${icons.clock}<span id="next-title">Próximos horários livres para corte</span></p>
            <p class="next__day" id="next-day"><span class="skeleton next__day-sk"></span></p>
            <ul class="next__slots" id="next-slots">
              ${'<li><span class="skeleton next__slot-sk"></span></li>'.repeat(6)}
            </ul>
            <p class="next__hint">Toque num horário para marcar.</p>
          </aside>
        </div>
      </section>

      <section class="section wrap" id="servicos" aria-labelledby="servicos-title">
        <h2 id="servicos-title">Serviços</h2>
        <ul class="prices" id="prices"></ul>
      </section>

      <section class="section wrap" id="equipe" aria-labelledby="equipe-title">
        <h2 id="equipe-title">Equipe</h2>
        <ul class="team" id="team"></ul>
      </section>

      <section class="section wrap section--split" id="horario" aria-labelledby="horario-title">
        <div>
          <h2 id="horario-title">Horário de funcionamento</h2>
          <p class="muted">Cada barbeiro tem o seu expediente; o agendamento só mostra os horários em que alguém está livre.</p>
        </div>
        <table class="hours" id="hours"><caption class="sr-only">Horário de funcionamento por dia da semana</caption><tbody></tbody></table>
      </section>
    </main>
    ${siteFooter}`;

  fill(app);
}

async function fill(app) {
  const { shop, services, barbers, workingHours } = await api.getShop();

  app.querySelector('#prices').innerHTML = services
    .map(
      (s) => `
      <li class="price">
        <div>
          <h3>${esc(s.name)}</h3>
          <p class="muted">${esc(s.description)}</p>
        </div>
        <p class="price__meta"><span>${formatDuration(s.durationMin)}</span><strong>${formatMoney(s.priceCents)}</strong></p>
      </li>`,
    )
    .join('');

  app.querySelector('#team').innerHTML = barbers
    .map(
      (b) => `
      <li class="barber">
        <span class="barber__mono" aria-hidden="true">${esc(b.name.charAt(0))}</span>
        <div>
          <h3>${esc(b.name)}</h3>
          <p class="muted">${esc(b.specialty)}</p>
          <p class="barber__days">${daysOf(b.id, workingHours)}</p>
        </div>
      </li>`,
    )
    .join('');

  app.querySelector('#hours tbody').innerHTML = openingHours(workingHours)
    .map((d) => `<tr${d.label === 'Fechado' ? ' class="is-closed"' : ''}><th scope="row">${d.name}</th><td>${d.label}</td></tr>`)
    .join('');

  fillNextSlots(app, shop);
}

// Procura o primeiro dia com horário livre e mostra até 6 horários.
async function fillNextSlots(app, shop) {
  const dayEl = app.querySelector('#next-day');
  const list = app.querySelector('#next-slots');
  if (!list) return;

  try {
    const days = (await api.getDays({ barberId: 'any' })).filter((d) => d.open);
    for (const { date } of days) {
      const slots = await api.getSlots({ date, serviceId: HERO_SERVICE, barberId: 'any' });
      if (!list.isConnected) return; // a pessoa já saiu da página
      if (!slots.length) continue;

      const today = dateKey(new Date(), shop.timezone);
      dayEl.textContent = relativeDay(date, today);
      list.innerHTML = slots
        .slice(0, 6)
        .map((s) => `<li><button class="next__slot" type="button" data-date="${date}" data-time="${s.time}">${s.time}</button></li>`)
        .join('');
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-time]');
        if (!btn) return;
        saveWizard({ step: 4, serviceId: HERO_SERVICE, barberId: 'any', date: btn.dataset.date, time: btn.dataset.time });
        location.hash = '#/agendar';
      });
      return;
    }
    dayEl.textContent = 'Agenda cheia';
    list.innerHTML = '<li class="muted">Nenhum horário livre nas próximas semanas.</li>';
  } catch (err) {
    console.error(err);
    dayEl.textContent = '';
    list.innerHTML = '<li>Não deu para carregar os horários. <a class="link" href="#/agendar">Abrir a agenda</a></li>';
  }
}
