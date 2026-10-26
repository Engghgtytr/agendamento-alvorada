import { icons, siteFooter, siteHeader } from '../components/layout.js';
import { toast } from '../components/toast.js';
import { api, isDemo } from '../services/api.js';
import { formatPhone } from '../utils/customer.js';
import { esc, formatDuration, formatMoney } from '../utils/format.js';
import { buildIcs } from '../utils/ics.js';
import { formatDay } from '../utils/time.js';
import { bookingMessage, whatsappLink } from '../utils/whatsapp.js';

const STATUS = {
  booked: 'Marcado',
  cancelled: 'Cancelado',
  done: 'Atendido',
  no_show: 'Não compareceu',
};

export function renderHorario(app, code, { isNew = false } = {}) {
  app.innerHTML = `
    ${siteHeader({ nav: false })}
    <main id="conteudo" class="booking wrap">
      <div class="ticket ticket--loading" aria-busy="true">
        <span class="skeleton" style="height:28px;width:55%"></span>
        <span class="skeleton" style="height:56px;width:80%;margin-top:16px"></span>
        <span class="skeleton" style="height:120px;margin-top:20px"></span>
      </div>
    </main>
    ${siteFooter}`;

  const main = app.querySelector('main');
  load();

  async function load() {
    let result;
    try {
      result = await api.getBooking(code);
    } catch (err) {
      console.error(err);
      main.innerHTML = `
        <div class="empty">
          <h1 class="booking__title">Não deu para abrir o agendamento</h1>
          <p>Confira a internet e tente de novo.</p>
          <button class="btn btn--outline" type="button" id="retry">Tentar de novo</button>
        </div>`;
      main.querySelector('#retry').addEventListener('click', () => renderHorario(app, code));
      return;
    }
    if (!main.isConnected) return;

    if (!result) {
      main.innerHTML = `
        <div class="empty">
          <h1 class="booking__title">Agendamento não encontrado</h1>
          <p>Confira se o link está completo.${isDemo ? ' No modo demonstração, os horários ficam salvos só no navegador em que foram marcados.' : ''}</p>
          <a class="btn btn--primary" href="#/agendar">Agendar um horário</a>
        </div>`;
      return;
    }

    show(result, isNew);
  }

  function show({ appointment: a, barber, shop }, celebrate) {
    const active = a.status === 'booked' && new Date(a.startsAt) > new Date();
    const cancelled = a.status === 'cancelled';
    const title = cancelled ? 'Horário cancelado' : celebrate ? 'Horário marcado' : 'Seu horário';
    const pageLink = `${location.origin}${location.pathname}#/horario/${code}`;

    main.innerHTML = `
      <article class="ticket${celebrate ? ' ticket--new' : ''}${cancelled ? ' ticket--cancelled' : ''}" aria-labelledby="ticket-title">
        <div class="ticket__head">
          ${
            cancelled
              ? ''
              : `<span class="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`
          }
          <div>
            <h1 class="booking__title" id="ticket-title" tabindex="-1">${title}</h1>
            <p class="ticket__status">${STATUS[a.status] ?? ''}</p>
          </div>
        </div>
        <p class="ticket__when"><span>${esc(formatDay(a.date))}</span><strong>${esc(a.time)}</strong></p>
        <dl class="ticket__info">
          <div><dt>Serviço</dt><dd>${esc(a.serviceName)} · ${formatDuration(a.durationMin)}</dd></div>
          <div><dt>Barbeiro</dt><dd>${esc(barber?.name ?? '')}</dd></div>
          <div><dt>Valor</dt><dd>${formatMoney(a.priceCents)}, pago na barbearia</dd></div>
          <div><dt>Nome</dt><dd>${esc(a.name)} · ${esc(formatPhone(a.phone))}</dd></div>
        </dl>
      </article>

      ${
        active
          ? `
        <div class="actions">
          <button class="btn btn--primary" type="button" id="ics">${icons.calendar}Adicionar à agenda do celular</button>
          <button class="btn btn--outline" type="button" id="whats">${icons.message}Avisar a barbearia no WhatsApp</button>
          <div class="keep">
            <p>Guarde este link para ver ou cancelar o horário:</p>
            <div class="keep__row">
              <input class="keep__url" id="link" value="${esc(pageLink)}" readonly aria-label="Link do seu agendamento" />
              <button class="btn btn--outline" type="button" id="copy">${icons.link}Copiar</button>
            </div>
          </div>
          <button class="link actions__cancel" type="button" id="cancel">Cancelar este horário</button>
        </div>`
          : `<div class="actions"><a class="btn btn--primary" href="#/agendar">Agendar outro horário</a></div>`
      }

      <dialog class="modal" id="cancel-dialog" aria-labelledby="cancel-title">
        <h2 id="cancel-title">Cancelar o horário?</h2>
        <p>${esc(formatDay(a.date))} às ${esc(a.time)}, ${esc(a.serviceName.toLowerCase())} com ${esc(barber?.name ?? '')}. O horário fica livre para outra pessoa.</p>
        <p class="alert" id="cancel-error" role="alert" hidden></p>
        <div class="modal__actions">
          <button class="btn btn--outline" type="button" id="keep" autofocus>Manter horário</button>
          <button class="btn btn--danger" type="button" id="confirm-cancel">Cancelar horário</button>
        </div>
      </dialog>

      <dialog class="modal" id="whats-dialog" aria-labelledby="whats-title">
        <h2 id="whats-title">Mensagem para a barbearia</h2>
        <p class="muted">A barbearia é fictícia, então o WhatsApp não abre. Numa barbearia de verdade, esta mensagem iria pronta:</p>
        <pre id="whats-text"></pre>
        <div class="modal__actions">
          <button class="btn btn--primary" type="button" id="whats-close" autofocus>Entendi</button>
        </div>
      </dialog>`;

    main.querySelector('#ticket-title').focus({ preventScroll: true });
    bind(a, barber, shop);
  }

  function bind(a, barber, shop) {
    main.querySelector('#ics')?.addEventListener('click', () => {
      const ics = buildIcs({
        uid: `${a.id}@alvorada`,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        summary: `${a.serviceName} com ${barber?.name} · ${shop.name}`,
        description: `Ver ou cancelar: ${location.origin}${location.pathname}#/horario/${code}`,
      });
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: 'horario-alvorada.ics' });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Arquivo baixado. Abra para salvar na sua agenda.');
    });

    main.querySelector('#whats')?.addEventListener('click', () => {
      const message = bookingMessage({ shopName: shop.name, service: { name: a.serviceName }, barber, date: a.date, time: a.time, name: a.name });
      // Loja fictícia: mostra a mensagem em vez de abrir conversa com um número que pode existir.
      if (!shop.whatsapp) {
        const dialog = main.querySelector('#whats-dialog');
        dialog.querySelector('#whats-text').textContent = message;
        dialog.showModal();
        return;
      }
      window.open(whatsappLink(shop.whatsapp, message), '_blank', 'noopener');
    });
    main.querySelector('#whats-close')?.addEventListener('click', () => main.querySelector('#whats-dialog').close());

    main.querySelector('#copy')?.addEventListener('click', async () => {
      const input = main.querySelector('#link');
      try {
        await navigator.clipboard.writeText(input.value);
        toast('Link copiado.');
      } catch {
        input.select();
        toast('Selecionei o link: copie com Ctrl+C.');
      }
    });

    const dialog = main.querySelector('#cancel-dialog');
    main.querySelector('#cancel')?.addEventListener('click', () => {
      dialog.querySelector('#cancel-error').hidden = true;
      dialog.showModal();
    });
    dialog.querySelector('#keep').addEventListener('click', () => dialog.close());

    let cancelling = false;
    dialog.querySelector('#confirm-cancel').addEventListener('click', async (e) => {
      if (cancelling) return;
      cancelling = true;
      const button = e.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Cancelando…';
      try {
        await api.cancel(code);
        dialog.close();
        toast('Horário cancelado.');
        const fresh = await api.getBooking(code);
        show(fresh, false);
      } catch (err) {
        cancelling = false;
        button.disabled = false;
        button.textContent = 'Cancelar horário';
        const box = dialog.querySelector('#cancel-error');
        box.textContent = err.code === 'too_late' ? err.message : 'Não deu para cancelar agora. Tente de novo.';
        box.hidden = false;
        if (err.code !== 'too_late') console.error(err);
      }
    });
  }
}
