import '../styles/admin.css';
import { icons, logo } from '../components/layout.js';
import { toast } from '../components/toast.js';
import { api, isDemo } from '../services/api.js';
import { slugify, validateDayRanges, validateService, validateTimeOff } from '../utils/admin-rules.js';
import { formatPhone } from '../utils/customer.js';
import { esc, formatDuration, formatMoney } from '../utils/format.js';
import { addDays, dateKey, formatDay, fromMinutes, timeLabel, toMinutes, weekdayOf } from '../utils/time.js';
import { whatsappLink } from '../utils/whatsapp.js';

// Painel do dono. Rotas: #/admin (agenda), #/admin/servicos e #/admin/expediente.
// Esconder telas aqui é só conforto: quem protege os dados é o RLS do banco.

const TABS = [
  ['agenda', '#/admin', 'Agenda'],
  ['servicos', '#/admin/servicos', 'Serviços'],
  ['expediente', '#/admin/expediente', 'Expediente'],
];
const STATUS = { booked: 'Marcado', done: 'Atendido', no_show: 'Faltou', cancelled: 'Cancelado' };
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // a tabela começa na segunda
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const PX_PER_MIN = 1.4;

let selectedDate = null; // o dia escolhido continua ao trocar de aba

export function renderAdmin(app, view = 'agenda') {
  const ctx = { app, view, alive: true, cleanups: [] };
  app.innerHTML = '<div class="admin"><p class="admin__loading">Carregando…</p></div>';
  start(ctx);
  return () => {
    ctx.alive = false;
    ctx.cleanups.forEach((fn) => fn());
  };
}

async function start(ctx) {
  try {
    const user = await api.session.current();
    if (!ctx.alive) return;
    if (!user) return showLogin(ctx);
    if (!user.isAdmin) return showNoAccess(ctx, user);
    showPanel(ctx, user);
  } catch (err) {
    if (!ctx.alive) return;
    ctx.app.innerHTML = `
      <div class="admin admin--center"><main class="login" id="conteudo">
        <p class="alert" role="alert">${icons.alert}<span>${esc(err.message)}</span></p>
        <button class="btn btn--primary" type="button" id="retry">Tentar de novo</button>
      </main></div>`;
    ctx.app.querySelector('#retry').addEventListener('click', () => start(ctx));
  }
}

function setBusy(button, busy, label) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label ?? button.textContent;
  }
}

// ---------- Entrar ----------

function showLogin(ctx) {
  if (isDemo) {
    ctx.app.innerHTML = `
      <div class="admin admin--center"><main class="login" id="conteudo">
        ${logo}
        <h1>Painel da barbearia</h1>
        <p>É aqui que o dono vê a agenda do dia, marca quem foi atendido, bloqueia horários e muda serviços e expediente.</p>
        <p>Como a barbearia é fictícia, dá para testar sem senha. <strong>As mudanças ficam só no seu navegador.</strong></p>
        <button class="btn btn--primary" type="button" id="demo">Entrar na demonstração</button>
        <a class="link" href="#/">Voltar para o site</a>
      </main></div>`;
    ctx.app.querySelector('#demo').addEventListener('click', async () => showPanel(ctx, await api.session.signIn()));
    return;
  }

  ctx.app.innerHTML = `
    <div class="admin admin--center"><main class="login" id="conteudo">
      ${logo}
      <h1>Painel da barbearia</h1>
      <form class="form" id="login" novalidate>
        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" type="email" autocomplete="username" />
        </div>
        <div class="field">
          <label for="password">Senha</label>
          <input id="password" type="password" autocomplete="current-password" />
        </div>
        <p class="field__error" id="login-error" role="alert"></p>
        <button class="btn btn--primary btn--block" type="submit">Entrar</button>
      </form>
      <p class="muted">O acesso é criado por quem cuida do site. Não há cadastro aberto.</p>
    </main></div>`;

  const form = ctx.app.querySelector('#login');
  const error = form.querySelector('#login-error');
  const button = form.querySelector('button');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (button.disabled) return; // trava o clique duplo
    const email = form.querySelector('#email');
    const password = form.querySelector('#password');
    if (!email.value.trim() || !password.value) {
      error.textContent = 'Preencha o e-mail e a senha.';
      (email.value.trim() ? password : email).focus();
      return;
    }
    error.textContent = '';
    setBusy(button, true, 'Entrando…');
    try {
      const user = await api.session.signIn(email.value.trim(), password.value);
      if (!ctx.alive) return;
      if (!user?.isAdmin) return showNoAccess(ctx, user);
      showPanel(ctx, user);
    } catch (err) {
      if (!ctx.alive) return;
      setBusy(button, false);
      error.textContent = err.message;
      password.select();
    }
  });
}

function showNoAccess(ctx, user) {
  ctx.app.innerHTML = `
    <div class="admin admin--center"><main class="login" id="conteudo">
      ${logo}
      <h1>Sem acesso ao painel</h1>
      <p>A conta ${esc(user?.email ?? '')} entrou, mas não está na lista de quem administra a barbearia.</p>
      <button class="btn btn--outline" type="button" id="logout">Sair</button>
    </main></div>`;
  ctx.app.querySelector('#logout').addEventListener('click', async () => {
    await api.session.signOut();
    showLogin(ctx);
  });
}

// ---------- Painel ----------

async function showPanel(ctx, user) {
  ctx.app.innerHTML = `
    <div class="admin">
      <header class="admin-bar">
        <div class="wrap">
          ${logo}
          <nav class="admin-tabs" aria-label="Painel">
            ${TABS.map(([id, href, label]) => `<a href="${href}"${id === ctx.view ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
          </nav>
          <button class="link admin-bar__out" type="button" id="logout">Sair</button>
        </div>
      </header>
      ${
        isDemo
          ? `<aside class="admin-demo wrap" aria-label="Aviso da demonstração">Demonstração: o que você muda aqui fica só neste navegador. <button class="link" type="button" id="reset">Desfazer tudo</button></aside>`
          : ''
      }
      <main class="admin-main wrap" id="conteudo"><p class="admin__loading">Carregando…</p></main>
      <dialog class="modal" id="dialog"></dialog>
    </div>`;

  ctx.main = ctx.app.querySelector('main');
  ctx.dialog = ctx.app.querySelector('#dialog');
  ctx.user = user;

  ctx.app.querySelector('#logout').addEventListener('click', async () => {
    await api.session.signOut();
    location.hash = '#/';
  });
  ctx.app.querySelector('#reset')?.addEventListener('click', async () => {
    await api.admin.reset();
    toast('Tudo voltou ao início da demonstração.');
    loadView(ctx);
  });

  loadView(ctx);
}

async function loadView(ctx) {
  try {
    ctx.data = await api.admin.getShop();
    if (!ctx.alive) return;
    const views = { agenda: viewAgenda, servicos: viewServices, expediente: viewHours };
    await views[ctx.view](ctx);
  } catch (err) {
    console.error(err);
    if (!ctx.alive) return;
    ctx.main.innerHTML = `
      <div class="empty">
        <p>Não deu para carregar o painel. Confira a internet e tente de novo.</p>
        <button class="btn btn--outline" type="button" id="retry">Tentar de novo</button>
      </div>`;
    ctx.main.querySelector('#retry').addEventListener('click', () => loadView(ctx));
  }
}

function openDialog(ctx, html) {
  ctx.dialog.innerHTML = html;
  ctx.dialog.showModal();
  return ctx.dialog;
}

// ---------- Agenda do dia ----------

async function viewAgenda(ctx) {
  const { shop, barbers, workingHours } = ctx.data;
  const today = dateKey(new Date(), shop.timezone);
  selectedDate ??= today;
  const date = selectedDate;

  ctx.main.innerHTML = `
    <div class="agenda-head">
      <h1>Agenda</h1>
      <div class="day-nav" role="group" aria-label="Escolher o dia">
        <button class="btn btn--outline btn--icon" type="button" data-shift="-1" aria-label="Dia anterior">${icons.back}</button>
        <button class="btn btn--outline" type="button" data-shift="0"${date === today ? ' disabled' : ''}>Hoje</button>
        <button class="btn btn--outline btn--icon btn--flip" type="button" data-shift="1" aria-label="Próximo dia">${icons.back}</button>
      </div>
      <button class="btn btn--primary" type="button" id="block">Bloquear horário</button>
    </div>
    <p class="agenda-day">${esc(formatDay(date))}${date === today ? ' · hoje' : ''}</p>
    <p class="agenda-sum" id="sum"></p>
    <div class="timeline-wrap" id="tl"><div class="skeleton" style="height:420px"></div></div>`;

  ctx.main.querySelector('.day-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-shift]');
    if (!btn) return;
    const shift = Number(btn.dataset.shift);
    selectedDate = shift === 0 ? today : addDays(date, shift);
    viewAgenda(ctx);
  });
  ctx.main.querySelector('#block').addEventListener('click', () => blockDialog(ctx, date));

  const { appointments, timeOff } = await api.admin.getDay(date);
  if (!ctx.alive || selectedDate !== date) return;

  const active = appointments.filter((a) => a.status !== 'cancelled');
  const count = (s) => active.filter((a) => a.status === s).length;
  ctx.main.querySelector('#sum').textContent = active.length
    ? `${active.length} ${active.length === 1 ? 'horário' : 'horários'} · ${count('done')} atendido${count('done') === 1 ? '' : 's'} · ${count('no_show')} falta${count('no_show') === 1 ? '' : 's'}`
    : 'Nenhum horário marcado neste dia.';

  const weekday = weekdayOf(date);
  const ranges = workingHours.filter((w) => w.weekday === weekday);
  const tl = ctx.main.querySelector('#tl');
  if (!ranges.length) {
    tl.innerHTML = '<p class="empty">A barbearia não abre neste dia.</p>';
    return;
  }

  const startMin = Math.floor(Math.min(...ranges.map((r) => toMinutes(r.start))) / 60) * 60;
  const endMin = Math.ceil(Math.max(...ranges.map((r) => toMinutes(r.end))) / 60) * 60;
  const height = (endMin - startMin) * PX_PER_MIN;
  const y = (min) => (min - startMin) * PX_PER_MIN;
  const minuteOf = (iso) => {
    const d = new Date(iso);
    const key = dateKey(d, shop.timezone);
    if (key < date) return startMin;
    if (key > date) return endMin;
    return toMinutes(timeLabel(d, shop.timezone));
  };

  const hours = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(`<span style="top:${y(m)}px">${fromMinutes(m)}</span>`);

  const column = (b) => {
    const open = ranges
      .filter((r) => r.barberId === b.id)
      .map((r) => `<div class="tl-open" style="top:${y(toMinutes(r.start))}px;height:${(toMinutes(r.end) - toMinutes(r.start)) * PX_PER_MIN}px"></div>`)
      .join('');
    const blocks = timeOff
      .filter((t) => t.barberId === b.id)
      .map((t) => {
        const top = y(Math.max(startMin, minuteOf(t.startsAt)));
        const h = Math.max(24, y(Math.min(endMin, minuteOf(t.endsAt))) - top);
        const label = `Bloqueado ${timeLabel(new Date(t.startsAt), shop.timezone)}–${timeLabel(new Date(t.endsAt), shop.timezone)}${t.reason ? `, ${t.reason}` : ''}`;
        return `
          <div class="tl-off" style="top:${top}px;height:${h}px">
            <span>${esc(label)}</span>
            <button type="button" data-unblock="${esc(t.id)}" aria-label="Desbloquear: ${esc(label)}">${icons.close}</button>
          </div>`;
      })
      .join('');
    const appts = active
      .filter((a) => a.barberId === b.id)
      .map((a) => {
        const top = y(minuteOf(a.startsAt));
        const h = Math.max(26, y(minuteOf(a.endsAt)) - top - 2);
        const who = a.name ?? 'Cliente de exemplo';
        return `
          <button class="tl-appt tl-appt--${a.status}${h < 50 ? ' tl-appt--short' : ''}" type="button" data-appt="${esc(a.id)}" style="top:${top}px;height:${h}px"
            aria-label="${esc(`${a.time}, ${who}, ${a.serviceName}, ${STATUS[a.status]}`)}">
            <strong>${esc(a.time)}</strong> <span>${esc(who)}</span>
            <small>${esc(a.serviceName)}${a.status !== 'booked' ? ` · ${STATUS[a.status]}` : ''}</small>
          </button>`;
      })
      .join('');
    return `<div class="tl-col" style="height:${height}px">${open}${blocks}${appts}</div>`;
  };

  tl.innerHTML = `
    <div class="timeline" style="--cols:${barbers.length}">
      <div class="tl-head"><span></span>${barbers.map((b) => `<span>${esc(b.name)}</span>`).join('')}</div>
      <div class="tl-body" style="height:${height}px;--hour:${60 * PX_PER_MIN}px">
        <div class="tl-hours" aria-hidden="true">${hours.join('')}</div>
        ${barbers.map(column).join('')}
        ${date === today ? '<div class="tl-now" id="now" aria-hidden="true"><span>agora</span></div>' : ''}
      </div>
    </div>`;

  // Linha do "agora": anda sozinha a cada minuto.
  const now = tl.querySelector('#now');
  if (now) {
    const place = () => {
      const m = toMinutes(timeLabel(new Date(), shop.timezone));
      now.hidden = m < startMin || m > endMin;
      now.style.transform = `translateY(${y(m)}px)`;
    };
    place();
    const timer = setInterval(place, 60_000);
    ctx.cleanups.push(() => clearInterval(timer));
  }

  tl.addEventListener('click', async (e) => {
    const apptBtn = e.target.closest('[data-appt]');
    if (apptBtn) {
      const appt = appointments.find((a) => String(a.id) === apptBtn.dataset.appt);
      if (appt) apptDialog(ctx, appt);
      return;
    }
    const unblock = e.target.closest('[data-unblock]');
    if (unblock) {
      unblock.disabled = true;
      try {
        await api.admin.removeTimeOff(unblock.dataset.unblock);
        toast('Horário desbloqueado.');
        viewAgenda(ctx);
      } catch (err) {
        unblock.disabled = false;
        toast(err.message);
      }
    }
  });
}

function apptDialog(ctx, a) {
  const barber = ctx.data.barbers.find((b) => b.id === a.barberId);
  const who = a.name ?? 'Cliente de exemplo';
  const phoneLink = a.phone
    ? `<a class="btn btn--outline" href="${esc(whatsappLink(a.phone, `Olá, ${a.name}! Aqui é da ${ctx.data.shop.name}, sobre o seu horário de ${formatDay(a.date ?? dateKey(new Date(a.startsAt), ctx.data.shop.timezone))} às ${a.time}.`))}" target="_blank" rel="noopener noreferrer">${icons.message}Chamar no WhatsApp</a>`
    : '';
  const dialog = openDialog(
    ctx,
    `
    <h2 id="d-title">${esc(a.time)} · ${esc(who)}</h2>
    <dl class="summary summary--plain">
      <div><dt>Serviço</dt><dd>${esc(a.serviceName)} · ${formatDuration(a.durationMin)}</dd></div>
      <div><dt>Barbeiro</dt><dd>${esc(barber?.name ?? '')}</dd></div>
      <div><dt>Valor</dt><dd>${formatMoney(a.priceCents)}</dd></div>
      <div><dt>WhatsApp</dt><dd>${a.phone ? esc(formatPhone(a.phone)) : '—'}</dd></div>
      <div><dt>Situação</dt><dd>${STATUS[a.status]}</dd></div>
    </dl>
    ${a.seed ? '<p class="note">Cliente de exemplo da demonstração, sem nome nem telefone.</p>' : ''}
    <p class="alert" id="d-error" role="alert" hidden></p>
    <div class="modal__actions modal__actions--wrap">
      ${phoneLink}
      ${a.status !== 'done' ? '<button class="btn btn--primary" type="button" data-status="done">Atendido</button>' : ''}
      ${a.status !== 'no_show' ? '<button class="btn btn--outline" type="button" data-status="no_show">Faltou</button>' : ''}
      ${a.status !== 'booked' ? '<button class="btn btn--outline" type="button" data-status="booked">Voltar para marcado</button>' : ''}
      <button class="btn btn--danger" type="button" data-status="cancelled">Cancelar horário</button>
      <button class="btn btn--outline" type="button" data-close autofocus>Fechar</button>
    </div>`,
  );
  dialog.setAttribute('aria-labelledby', 'd-title');

  dialog.onclick = async (e) => {
    if (e.target.closest('[data-close]')) return dialog.close();
    const btn = e.target.closest('[data-status]');
    if (!btn || btn.disabled) return;
    const status = btn.dataset.status;
    if (status === 'cancelled' && btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = 'Toque de novo para cancelar';
      return;
    }
    dialog.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await api.admin.setStatus(a.id, status);
      dialog.close();
      toast(`${who}: ${STATUS[status].toLowerCase()}.`);
      viewAgenda(ctx);
    } catch (err) {
      dialog.querySelectorAll('button').forEach((b) => (b.disabled = false));
      const box = dialog.querySelector('#d-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  };
}

function blockDialog(ctx, date) {
  const { barbers } = ctx.data;
  const dialog = openDialog(
    ctx,
    `
    <h2 id="b-title">Bloquear horário</h2>
    <p class="muted">Ninguém consegue marcar nesse intervalo. Quem já marcou continua marcado: avise a pessoa.</p>
    <form class="form" id="block-form" novalidate>
      <div class="field">
        <label for="b-barber">Barbeiro</label>
        <select id="b-barber" aria-describedby="b-barber-error">
          ${barbers.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}
        </select>
        <p class="field__error" id="b-barber-error"></p>
      </div>
      <div class="field">
        <label for="b-date">Dia</label>
        <input id="b-date" type="date" value="${esc(date)}" aria-describedby="b-date-error" />
        <p class="field__error" id="b-date-error"></p>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="b-start">De</label>
          <input id="b-start" type="time" step="900" value="12:00" aria-describedby="b-start-error" />
          <p class="field__error" id="b-start-error"></p>
        </div>
        <div class="field">
          <label for="b-end">Até</label>
          <input id="b-end" type="time" step="900" value="13:00" aria-describedby="b-end-error" />
          <p class="field__error" id="b-end-error"></p>
        </div>
      </div>
      <div class="field">
        <label for="b-reason">Motivo <span class="muted">(só você vê)</span></label>
        <input id="b-reason" maxlength="100" placeholder="Almoço, folga, médico…" aria-describedby="b-reason-error" />
        <p class="field__error" id="b-reason-error"></p>
      </div>
      <p class="alert" id="b-error" role="alert" hidden></p>
      <div class="modal__actions">
        <button class="btn btn--outline" type="button" data-close>Cancelar</button>
        <button class="btn btn--primary" type="submit">Bloquear</button>
      </div>
    </form>`,
  );
  dialog.setAttribute('aria-labelledby', 'b-title');
  dialog.onclick = (e) => e.target.closest('[data-close]') && dialog.close();

  const form = dialog.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const value = {
      barberId: form.querySelector('#b-barber').value,
      date: form.querySelector('#b-date').value,
      start: form.querySelector('#b-start').value,
      end: form.querySelector('#b-end').value,
      reason: form.querySelector('#b-reason').value,
    };
    const errors = validateTimeOff(value);
    const fields = { barberId: 'b-barber', date: 'b-date', start: 'b-start', end: 'b-end', reason: 'b-reason' };
    for (const [key, id] of Object.entries(fields)) {
      form.querySelector(`#${id}-error`).textContent = errors[key] ?? '';
      form.querySelector(`#${id}`).setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    }
    const first = Object.keys(fields).find((k) => errors[k]);
    if (first) return form.querySelector(`#${fields[first]}`).focus();

    setBusy(button, true, 'Bloqueando…');
    try {
      await api.admin.addTimeOff(value);
      dialog.close();
      toast('Horário bloqueado.');
      selectedDate = value.date;
      viewAgenda(ctx);
    } catch (err) {
      setBusy(button, false);
      const box = form.querySelector('#b-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  };
}

// ---------- Serviços ----------

function viewServices(ctx) {
  const { services } = ctx.data;
  ctx.main.innerHTML = `
    <div class="agenda-head">
      <h1>Serviços</h1>
      <button class="btn btn--primary" type="button" id="new">Novo serviço</button>
    </div>
    <p class="muted admin-lead">Desativar tira o serviço do site sem apagar o histórico. Mudar o preço não muda o de quem já marcou.</p>
    <ul class="svc-list">
      ${services
        .map(
          (s) => `
        <li class="svc${s.active === false ? ' svc--off' : ''}">
          <div>
            <h2>${esc(s.name)}</h2>
            <p class="muted">${formatDuration(s.durationMin)} · ${formatMoney(s.priceCents)}${s.active === false ? ' · <strong>desativado</strong>' : ''}</p>
          </div>
          <button class="btn btn--outline" type="button" data-edit="${esc(s.id)}" aria-label="Editar ${esc(s.name)}">Editar</button>
        </li>`,
        )
        .join('')}
    </ul>`;

  ctx.main.querySelector('#new').addEventListener('click', () => serviceDialog(ctx, null));
  ctx.main.querySelector('.svc-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) serviceDialog(ctx, services.find((s) => s.id === btn.dataset.edit));
  });
}

function serviceDialog(ctx, s) {
  const durations = [];
  for (let m = 5; m <= 180; m += 5) durations.push(m);
  if (s && !durations.includes(s.durationMin)) durations.push(s.durationMin);
  const current = s?.durationMin ?? 30;

  const dialog = openDialog(
    ctx,
    `
    <h2 id="s-title">${s ? 'Editar serviço' : 'Novo serviço'}</h2>
    <form class="form" novalidate>
      <div class="field">
        <label for="s-name">Nome</label>
        <input id="s-name" maxlength="60" value="${esc(s?.name ?? '')}" aria-describedby="s-name-error" />
        <p class="field__error" id="s-name-error"></p>
      </div>
      <div class="field">
        <label for="s-desc">Descrição curta</label>
        <input id="s-desc" maxlength="200" value="${esc(s?.description ?? '')}" aria-describedby="s-desc-error" />
        <p class="field__error" id="s-desc-error"></p>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="s-dur">Duração</label>
          <select id="s-dur" aria-describedby="s-dur-error">
            ${durations.map((m) => `<option value="${m}"${m === current ? ' selected' : ''}>${formatDuration(m)}</option>`).join('')}
          </select>
          <p class="field__error" id="s-dur-error"></p>
        </div>
        <div class="field">
          <label for="s-price">Preço (R$)</label>
          <input id="s-price" inputmode="decimal" value="${s ? (s.priceCents / 100).toFixed(2).replace('.', ',') : ''}" placeholder="45,00" aria-describedby="s-price-error" />
          <p class="field__error" id="s-price-error"></p>
        </div>
      </div>
      <label class="check"><input id="s-active" type="checkbox"${s?.active === false ? '' : ' checked'} /> Aparece no site</label>
      <p class="alert" id="s-error" role="alert" hidden></p>
      <div class="modal__actions">
        <button class="btn btn--outline" type="button" data-close>Cancelar</button>
        <button class="btn btn--primary" type="submit">Salvar</button>
      </div>
    </form>`,
  );
  dialog.setAttribute('aria-labelledby', 's-title');
  dialog.onclick = (e) => e.target.closest('[data-close]') && dialog.close();

  const form = dialog.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const { errors, value } = validateService({
      name: form.querySelector('#s-name').value,
      description: form.querySelector('#s-desc').value,
      durationMin: Number(form.querySelector('#s-dur').value),
      priceText: form.querySelector('#s-price').value,
    });
    const fields = { name: 's-name', description: 's-desc', durationMin: 's-dur', price: 's-price' };
    for (const [key, id] of Object.entries(fields)) {
      form.querySelector(`#${id}-error`).textContent = errors[key] ?? '';
      form.querySelector(`#${id}`).setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    }
    const first = Object.keys(fields).find((k) => errors[k]);
    if (first) return form.querySelector(`#${fields[first]}`).focus();

    let id = s?.id;
    if (!id) {
      id = slugify(value.name) || 'servico';
      const taken = new Set(ctx.data.services.map((x) => x.id));
      for (let i = 2; taken.has(id); i++) id = `${slugify(value.name)}-${i}`;
    }

    setBusy(button, true, 'Salvando…');
    try {
      await api.admin.saveService({
        id,
        ...value,
        active: form.querySelector('#s-active').checked,
        ...(s ? {} : { position: ctx.data.services.length + 1 }),
      });
      dialog.close();
      toast(s ? 'Serviço salvo.' : 'Serviço criado.');
      loadView(ctx);
    } catch (err) {
      setBusy(button, false);
      const box = form.querySelector('#s-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  };
}

// ---------- Expediente ----------

function viewHours(ctx) {
  const { barbers, workingHours } = ctx.data;

  const rowFor = (barberId, weekday) => {
    const ranges = workingHours
      .filter((w) => w.barberId === barberId && w.weekday === weekday)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    const [r1 = {}, r2 = {}] = ranges;
    const id = `${barberId}-${weekday}`;
    return `
      <tr data-weekday="${weekday}">
        <th scope="row">${DAY_NAMES[weekday]}</th>
        <td><input type="time" step="900" value="${esc(r1.start ?? '')}" aria-label="${DAY_NAMES[weekday]}: início do 1º turno" data-k="s1" /></td>
        <td><input type="time" step="900" value="${esc(r1.end ?? '')}" aria-label="${DAY_NAMES[weekday]}: fim do 1º turno" data-k="e1" /></td>
        <td><input type="time" step="900" value="${esc(r2.start ?? '')}" aria-label="${DAY_NAMES[weekday]}: início do 2º turno" data-k="s2" /></td>
        <td><input type="time" step="900" value="${esc(r2.end ?? '')}" aria-label="${DAY_NAMES[weekday]}: fim do 2º turno" data-k="e2" /></td>
        <td class="hours-err" id="err-${id}" role="alert"></td>
      </tr>`;
  };

  ctx.main.innerHTML = `
    <h1>Expediente</h1>
    <p class="muted admin-lead">Deixe o dia em branco quando o barbeiro não atende. O 2º turno é para quem tem intervalo de almoço. Horários já marcados não mudam.</p>
    ${barbers
      .map(
        (b) => `
      <section class="hours-card" data-barber="${esc(b.id)}" aria-labelledby="h-${esc(b.id)}">
        <h2 id="h-${esc(b.id)}">${esc(b.name)}</h2>
        <div class="hours-scroll">
          <table class="hours-table">
            <thead><tr><th scope="col">Dia</th><th scope="col" colspan="2">1º turno</th><th scope="col" colspan="2">2º turno</th><th><span class="sr-only">Erro</span></th></tr></thead>
            <tbody>${WEEK.map((d) => rowFor(b.id, d)).join('')}</tbody>
          </table>
        </div>
        <button class="btn btn--primary" type="button" data-save>Salvar expediente de ${esc(b.name)}</button>
      </section>`,
      )
      .join('')}`;

  // onclick (e não addEventListener): recarregar a aba não empilha ouvintes repetidos.
  ctx.main.onclick = async (e) => {
    const button = e.target.closest('[data-save]');
    if (!button || button.disabled) return;
    const card = button.closest('[data-barber]');
    const barberId = card.dataset.barber;
    const ranges = [];
    let firstBad = null;

    for (const row of card.querySelectorAll('tr[data-weekday]')) {
      const v = (k) => row.querySelector(`[data-k="${k}"]`).value;
      const day = [
        { start: v('s1'), end: v('e1') },
        { start: v('s2'), end: v('e2') },
      ];
      const error = validateDayRanges(day);
      row.querySelector('.hours-err').textContent = error ?? '';
      row.querySelectorAll('input').forEach((i) => i.setAttribute('aria-invalid', error ? 'true' : 'false'));
      if (error) firstBad ??= row.querySelector('input');
      const weekday = Number(row.dataset.weekday);
      for (const r of day) if (r.start && r.end) ranges.push({ weekday, start: r.start, end: r.end });
    }
    if (firstBad) return firstBad.focus();

    setBusy(button, true, 'Salvando…');
    try {
      await api.admin.saveHours(barberId, ranges);
      ctx.data = await api.admin.getShop();
      setBusy(button, false);
      toast('Expediente salvo.');
    } catch (err) {
      setBusy(button, false);
      toast(err.message);
    }
  };
}
