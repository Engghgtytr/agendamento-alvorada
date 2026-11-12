import { icons, logo } from '../components/layout.js';
import { api, isDemo } from '../services/api.js';
import { clearWizard, loadWizard, saveWizard } from '../services/wizard-state.js';
import { validateName, validatePhone, NAME_MAX } from '../utils/customer.js';
import { esc, formatDuration, formatMoney, prefersReducedMotion } from '../utils/format.js';
import { groupByPeriod } from '../utils/slots.js';
import { dayOfMonth, formatDay, weekdayShort } from '../utils/time.js';
import { labels, priceText, SIZES, sizePrice } from '../utils/labels.js';

const TOTAL = 4;
const PERIODS = [
  ['manha', 'Manhã'],
  ['tarde', 'Tarde'],
  ['noite', 'Noite'],
];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function renderAgendar(app) {
  app.innerHTML = `
    <header class="site-header">
      <div class="wrap">${logo}<a class="link" href="#/">Sair</a></div>
    </header>
    <main id="conteudo" class="wizard">
      <div class="wizard__head">
        <div class="wizard__bar">
          <button class="wizard__back" type="button" id="back">${icons.back}<span>Voltar</span></button>
          <p class="wizard__count" id="count"></p>
        </div>
        <div class="progress" aria-hidden="true"><span class="progress__fill" id="progress"></span></div>
        <ul class="choices" id="choices" aria-label="Suas escolhas"></ul>
      </div>
      <section class="wizard__step" id="step" aria-live="off"></section>
    </main>`;

  const el = {
    back: app.querySelector('#back'),
    count: app.querySelector('#count'),
    progress: app.querySelector('#progress'),
    choices: app.querySelector('#choices'),
    step: app.querySelector('#step'),
  };

  let data = null;
  let state = loadWizard();
  let slotRequest = 0;

  const service = () => data.services.find((s) => s.id === state.serviceId);
  const barber = () => data.barbers.find((b) => b.id === state.barberId);
  const barberLabel = () => (state.barberId === 'any' ? 'Qualquer um disponível' : barber()?.name);

  function save() {
    saveWizard(state);
  }

  // Não deixa pular passos: sem serviço volta ao 1, sem barbeiro ao 2…
  function allowedStep(step) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date ?? '')) state.date = null;
    if (!/^\d{2}:\d{2}$/.test(state.time ?? '')) state.time = null;
    if (step >= 2 && !service()) return 1;
    if (step >= 3 && !(state.barberId === 'any' || barber())) return 2;
    if (step >= 4 && !(state.date && state.time)) return 3;
    return Math.min(Math.max(1, Number(step) || 1), TOTAL);
  }

  function go(step, { animate = true } = {}) {
    const previous = state.step;
    state.step = allowedStep(step);
    save();
    render(animate ? Math.sign(state.step - previous) : 0);
  }

  function renderHead() {
    el.count.textContent = `Passo ${state.step} de ${TOTAL}`;
    el.progress.style.transform = `scaleX(${state.step / TOTAL})`;
    el.back.querySelector('span').textContent = state.step === 1 ? 'Início' : 'Voltar';

    const items = [];
    if (state.step > 1 && service()) items.push([1, 'Serviço', service().name]);
    if (state.step > 2) items.push([2, 'Barbeiro', barberLabel()]);
    if (state.step > 3) items.push([3, 'Dia e hora', `${weekdayShort(state.date)} ${dayOfMonth(state.date)}/${state.date.slice(5, 7)}, ${state.time}`]);
    el.choices.innerHTML = items
      .map(
        ([step, label, value]) =>
          `<li><button class="choice" type="button" data-step="${step}" aria-label="${label}: ${esc(value)}. Trocar">${esc(value)}</button></li>`,
      )
      .join('');
  }

  let renderId = 0;

  async function render(direction = 0) {
    const id = ++renderId;
    renderHead();
    const views = { 1: viewService, 2: viewBarber, 3: viewDay, 4: viewForm };
    await views[state.step]();
    if (id !== renderId) return; // outro passo já foi aberto enquanto este carregava

    // Leva o foco para o título do passo: quem usa leitor de tela ouve onde está.
    el.step.querySelector('h1')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });

    if (direction) {
      const reduce = prefersReducedMotion();
      el.step.animate(
        [{ opacity: 0, transform: reduce ? 'none' : `translateX(${direction * 24}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
    }
  }

  // Passo 1: serviço
  function viewService() {
    el.step.innerHTML = `
      <h1 tabindex="-1">Qual serviço?</h1>
      <fieldset class="options">
        <legend class="sr-only">Serviço</legend>
        ${data.services
          .map(
            (s) => `
          <label class="option">
            <input type="radio" name="service" value="${s.id}" ${s.id === state.serviceId ? 'checked' : ''} />
            <span class="option__main">
              <span class="option__title">${esc(s.name)}</span>
              <span class="option__desc">${esc(s.description)}</span>
            </span>
            <span class="option__meta"><span>${formatDuration(s.durationMin)}</span><strong>${esc(priceText(s))}</strong></span>
          </label>`,
          )
          .join('')}
      </fieldset>`;
  }

  // Passo 2: barbeiro
  function viewBarber() {
    const option = (id, title, desc, mono) => `
      <label class="option">
        <input type="radio" name="barber" value="${id}" ${id === state.barberId ? 'checked' : ''} />
        <span class="option__mono" aria-hidden="true">${mono}</span>
        <span class="option__main">
          <span class="option__title">${esc(title)}</span>
          <span class="option__desc">${esc(desc)}</span>
        </span>
      </label>`;

    el.step.innerHTML = `
      <h1 tabindex="-1">Com quem?</h1>
      <fieldset class="options">
        <legend class="sr-only">${labels(data.shop).staff}</legend>
        ${option('any', 'Qualquer um disponível', 'Mostra mais horários. Quem estiver livre atende você.', '*')}
        ${data.barbers.map((b) => option(b.id, b.name, b.specialty, esc(b.name.charAt(0)))).join('')}
      </fieldset>`;
  }

  // Passo 3: dia e horário
  async function viewDay() {
    const days = await api.getDays({ barberId: state.barberId });
    const pickFirst = !state.date || !days.some((d) => d.date === state.date && d.open);
    if (pickFirst) {
      state.date = days.find((d) => d.open)?.date ?? null;
      save();
    }
    const firstOpen = days.find((d) => d.open)?.date;

    const notice = state.notice;
    delete state.notice;
    save();

    el.step.innerHTML = `
      <h1 tabindex="-1">Que dia e horário?</h1>
      ${notice ? `<p class="alert" role="alert">${icons.alert}<span>${esc(notice)}</span></p>` : ''}
      <fieldset class="days">
        <legend class="sr-only">Dia</legend>
        <div class="days__strip">
          ${days
            .map((d, i) => {
              const showMonth = d.date === firstOpen || d.date.endsWith('-01');
              return `
            <label class="day${d.open ? '' : ' day--closed'}">
              <input type="radio" name="day" value="${d.date}" ${d.date === state.date ? 'checked' : ''} ${d.open ? '' : 'disabled'} />
              <span class="day__week">${weekdayShort(d.date)}</span>
              <span class="day__num">${dayOfMonth(d.date)}</span>
              <span class="day__month">${d.open ? (showMonth ? MONTHS[Number(d.date.slice(5, 7)) - 1] : '&nbsp;') : 'fechado'}</span>
              <span class="sr-only">${formatDay(d.date)}${d.open ? '' : ', fechado'}</span>
            </label>`;
            })
            .join('')}
        </div>
      </fieldset>
      <div id="slots" class="slots" aria-live="polite"></div>`;

    loadSlots({ findNext: pickFirst });
  }

  function selectDay(date) {
    const input = el.step.querySelector(`input[name="day"][value="${date}"]`);
    if (!input) return;
    input.checked = true;
    input.closest('.day').scrollIntoView({ block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  // Procura, a partir do dia escolhido, o primeiro dia aberto que tem horário livre.
  async function firstDayWithSlots(fromDate, request) {
    const days = (await api.getDays({ barberId: state.barberId })).filter((d) => d.open && d.date >= fromDate);
    for (const { date } of days) {
      const slots = await api.getSlots({ date, serviceId: state.serviceId, barberId: state.barberId });
      if (request !== slotRequest) return null;
      if (slots.length) return { date, slots };
    }
    return { date: fromDate, slots: [] };
  }

  async function loadSlots({ findNext = false } = {}) {
    const box = el.step.querySelector('#slots');
    if (!box || !state.date) {
      if (box) box.innerHTML = '<p class="empty">Nenhum dia aberto nas próximas semanas.</p>';
      return;
    }
    const request = ++slotRequest;
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = `<p class="sr-only">Carregando horários</p><div class="slots__grid">${'<span class="skeleton slot-sk"></span>'.repeat(12)}</div>`;

    try {
      let slots;
      if (findNext) {
        const found = await firstDayWithSlots(state.date, request);
        if (!found) return;
        state.date = found.date;
        slots = found.slots;
        save();
      } else {
        slots = await api.getSlots({ date: state.date, serviceId: state.serviceId, barberId: state.barberId });
      }
      if (request !== slotRequest || !box.isConnected) return; // a pessoa já trocou de dia
      box.removeAttribute('aria-busy');
      selectDay(state.date);

      if (!slots.length) {
        box.innerHTML = `
          <div class="empty">
            <p>Nenhum horário livre em ${esc(formatDay(state.date))} para ${esc(service().name.toLowerCase())}${findNext ? ' nem nos dias seguintes' : ''}.</p>
            ${findNext ? '' : '<button class="btn btn--outline" type="button" id="next-day">Ver o próximo dia com horário</button>'}
          </div>`;
        return;
      }

      const groups = groupByPeriod(slots, data.shop.timezone);
      box.innerHTML = `
        <p class="slots__day">${esc(formatDay(state.date))}</p>
        ${PERIODS.filter(([key]) => groups[key].length)
          .map(
            ([key, label]) => `
          <fieldset class="slots__group">
            <legend>${label}</legend>
            <div class="slots__grid">
              ${groups[key]
                .map(
                  (s) => `
                <label class="slot">
                  <input type="radio" name="time" value="${s.time}" ${s.time === state.time ? 'checked' : ''} />
                  <span>${s.time}</span>
                </label>`,
                )
                .join('')}
            </div>
          </fieldset>`,
          )
          .join('')}`;
    } catch (err) {
      if (request !== slotRequest) return;
      console.error(err);
      box.removeAttribute('aria-busy');
      box.innerHTML = `
        <div class="empty">
          <p>Não deu para carregar os horários. Confira a internet e tente de novo.</p>
          <button class="btn btn--outline" type="button" id="retry">Tentar de novo</button>
        </div>`;
    }
  }

  // Passo 4: dados e confirmação
  function viewForm() {
    const s = service();
    const L = labels(data.shop);
    const pet = data.shop.petMode;
    el.step.innerHTML = `
      <h1 tabindex="-1">Seus dados</h1>
      <dl class="summary">
        <div><dt>Serviço</dt><dd>${esc(s.name)} <span class="muted">· ${formatDuration(s.durationMin)}</span></dd></div>
        <div><dt>${L.staff}</dt><dd>${esc(barberLabel())}</dd></div>
        <div><dt>Quando</dt><dd>${esc(formatDay(state.date))} às ${esc(state.time)}</dd></div>
        <div><dt>Valor</dt><dd><span id="valor">${s.sizePrices ? 'Escolha o porte do pet' : formatMoney(s.priceCents)}</span> <span class="muted">· pago ${L.place}</span></dd></div>
      </dl>

      <form class="form" id="form" novalidate>
        <p class="alert" id="form-error" role="alert" hidden></p>
        ${pet ? `
        <div class="field">
          <label for="pet-name">Nome do pet</label>
          <input id="pet-name" name="pet-name" maxlength="40" autocomplete="off" aria-describedby="pet-name-error" />
          <p class="field__error" id="pet-name-error"></p>
        </div>
        <fieldset class="field pet-sizes">
          <legend>Porte</legend>
          <div class="pet-sizes__row">
            ${Object.entries(SIZES).map(([k, label]) => `
              <label class="pet-size"><input type="radio" name="pet-size" value="${k}" /><span>${label}${s.sizePrices ? `<small>${formatMoney(sizePrice(s, k))}</small>` : ''}</span></label>`).join('')}
          </div>
          <p class="field__error" id="pet-size-error"></p>
        </fieldset>
        <div class="field">
          <label for="pet-breed">Raça <span class="muted">(opcional)</span></label>
          <input id="pet-breed" name="pet-breed" maxlength="40" autocomplete="off" />
        </div>` : ''}
        <div class="field">
          <label for="name">Seu nome</label>
          <input id="name" name="name" autocomplete="name" maxlength="${NAME_MAX}" value="${esc(state.name ?? '')}" aria-describedby="name-error" />
          <p class="field__error" id="name-error"></p>
        </div>
        <div class="field">
          <label for="phone">WhatsApp</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 91234-5678" value="${esc(state.phone ?? '')}" aria-describedby="phone-hint phone-error" />
          <p class="field__hint" id="phone-hint">Para ${L.to} falar com você se precisar mudar algo.</p>
          <p class="field__error" id="phone-error"></p>
        </div>
        <div class="hp" aria-hidden="true">
          <label for="website">Não preencha este campo</label>
          <input id="website" name="website" tabindex="-1" autocomplete="off" />
        </div>

        <p class="form__privacy muted">Usamos seu nome e WhatsApp só para este horário e apagamos 30 dias depois. <a class="link" href="#/privacidade">Privacidade</a></p>
        ${isDemo ? `<p class="note">Modo demonstração: o horário fica salvo só neste navegador e ${L.to} é fictíci${pet ? 'o' : 'a'}.</p>` : ''}

        <button class="btn btn--primary btn--block" type="submit" id="submit">Confirmar agendamento</button>
      </form>`;
  }

  function showFieldError(input, message) {
    const err = el.step.querySelector(`#${input.id}-error`);
    err.textContent = message ?? '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  let sending = false;

  async function submit(form) {
    if (sending) return; // trava contra clique duplo
    const nameInput = form.querySelector('#name');
    const phoneInput = form.querySelector('#phone');
    const formError = form.querySelector('#form-error');
    formError.hidden = true;

    const name = validateName(nameInput.value);
    const phone = validatePhone(phoneInput.value);
    showFieldError(nameInput, name.error);
    showFieldError(phoneInput, phone.error);
    // Pet shop: nome e porte do pet
    let pet = null;
    let petInvalid = null;
    if (data.shop.petMode) {
      const petInput = form.querySelector('#pet-name');
      const size = form.querySelector('input[name="pet-size"]:checked')?.value ?? null;
      pet = { name: petInput.value.trim(), size, breed: form.querySelector('#pet-breed').value.trim() };
      showFieldError(petInput, pet.name ? null : 'Informe o nome do pet.');
      form.querySelector('#pet-size-error').textContent = size ? '' : 'Escolha o porte.';
      petInvalid = !pet.name ? petInput : !size ? form.querySelector('input[name="pet-size"]') : null;
    }
    const firstInvalid = [petInvalid, name.error && nameInput, phone.error && phoneInput].find(Boolean);
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const button = form.querySelector('#submit');
    sending = true;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Confirmando…';

    try {
      const { code } = await api.book({
        date: state.date,
        time: state.time,
        serviceId: state.serviceId,
        barberId: state.barberId,
        name: name.value,
        phone: phone.value,
        website: form.querySelector('#website').value,
        pet,
      });
      clearWizard();
      location.hash = `#/horario/${code}?novo`;
    } catch (err) {
      sending = false;
      button.disabled = false;
      button.textContent = 'Confirmar agendamento';

      if (err.code === 'slot_taken') {
        state.time = null;
        state.notice = err.message;
        go(3);
        return;
      }
      console.error(err);
      formError.innerHTML = `${icons.alert}<span></span>`;
      formError.querySelector('span').textContent =
        err.code === 'limit' || err.code === 'invalid' ? err.message : 'Não deu para confirmar agora. Confira a internet e tente de novo.';
      formError.hidden = false;
      formError.scrollIntoView({ block: 'center' });
    }
  }

  // Tocar de novo na opção que já estava escolhida não dispara "change".
  // Sem isto, quem volta um passo e toca no mesmo horário fica parado.
  let changed = false;
  el.step.addEventListener('click', (e) => {
    const label = e.target.closest('label.option, label.slot');
    if (!label) return;
    changed = false;
    setTimeout(() => {
      const input = label.querySelector('input');
      if (changed || !input.checked) return;
      const next = { service: 2, barber: 3, time: 4 }[input.name];
      if (next) go(next);
    });
  });

  // Um ouvinte só para o passo inteiro (as telas são recriadas a cada passo).
  el.step.addEventListener('change', (e) => {
    changed = true;
    const { name, value } = e.target;
    // Porte escolhido: mostra o preço daquele porte no resumo
    if (name === 'pet-size') {
      el.step.querySelector('#valor').textContent = formatMoney(sizePrice(service(), value));
      el.step.querySelector('#pet-size-error').textContent = '';
      return;
    }
    if (name === 'service') {
      if (state.serviceId !== value) state.time = null;
      state.serviceId = value;
      go(2);
    } else if (name === 'barber') {
      if (state.barberId !== value) state.time = null;
      state.barberId = value;
      go(3);
    } else if (name === 'day') {
      state.date = value;
      state.time = null;
      save();
      loadSlots();
    } else if (name === 'time') {
      state.time = value;
      go(4);
    }
  });

  el.step.addEventListener('input', (e) => {
    if (e.target.id === 'pet-name' && e.target.getAttribute('aria-invalid') === 'true') showFieldError(e.target, null);
    if (e.target.id === 'name' || e.target.id === 'phone') {
      state[e.target.id] = e.target.value;
      save();
      if (e.target.getAttribute('aria-invalid') === 'true') showFieldError(e.target, null);
    }
  });

  el.step.addEventListener('click', async (e) => {
    if (e.target.closest('#retry')) loadSlots();
    if (e.target.closest('#next-day')) {
      const days = await api.getDays({ barberId: state.barberId });
      const next = days.find((d) => d.open && d.date > state.date);
      if (next) {
        state.date = next.date;
        state.time = null;
        save();
        loadSlots({ findNext: true });
      }
    }
  });

  el.step.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(e.target);
  });

  el.choices.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (btn) go(Number(btn.dataset.step));
  });

  el.back.addEventListener('click', () => {
    if (state.step === 1) location.hash = '#/';
    else go(state.step - 1);
  });

  (async () => {
    data = await api.getShop();
    state.step = allowedStep(state.step ?? 1);
    save();
    render();
  })();
}
