import './styles/base.css';
import './styles/home.css';
import './styles/agendar.css';
import './styles/horario.css';
import './styles/prose.css';

import { renderHome } from './pages/home.js';
import { renderAgendar } from './pages/agendar.js';
import { renderHorario } from './pages/horario.js';
import { renderPrivacidade } from './pages/privacidade.js';

// O painel do dono só é baixado quando alguém abre #/admin:
// quem só quer agendar não carrega esse código.
const lazyAdmin = (view) => (el) => {
  let alive = true;
  let cleanup = null;
  el.innerHTML = '<p class="admin__loading">Carregando…</p>';
  import('./pages/admin.js').then((m) => {
    if (alive) cleanup = m.renderAdmin(el, view);
  });
  return () => {
    alive = false;
    cleanup?.();
  };
};

const app = document.getElementById('app');
const description = document.querySelector('meta[name="description"]');
const HOME_DESCRIPTION = description.content;

// Roteamento por hash (#/agendar). Funciona em qualquer hospedagem estática.
const routes = {
  '/': { title: 'Barbearia Alvorada · Agende seu horário', render: renderHome },
  '/agendar': {
    title: 'Agendar · Barbearia Alvorada',
    description: 'Escolha o serviço, o barbeiro, o dia e um horário livre na Barbearia Alvorada (fictícia).',
    render: renderAgendar,
  },
  '/privacidade': {
    title: 'Privacidade · Barbearia Alvorada',
    description: 'Que dados o agendamento da Barbearia Alvorada guarda, para quê e por quanto tempo.',
    render: renderPrivacidade,
  },
  '/admin': { title: 'Agenda · Painel · Barbearia Alvorada', render: lazyAdmin('agenda') },
  '/admin/servicos': { title: 'Serviços · Painel · Barbearia Alvorada', render: lazyAdmin('servicos') },
  '/admin/expediente': { title: 'Expediente · Painel · Barbearia Alvorada', render: lazyAdmin('expediente') },
};

// Cada página pode devolver uma função de limpeza (parar relógios etc.).
let cleanup = null;

function router() {
  const hash = location.hash;
  // "#servicos" é um link para uma seção da página inicial, não uma rota:
  // deixa o navegador rolar até ela (e desenha a página se ainda não existe).
  if (hash && !hash.startsWith('#/')) {
    if (!app.hasChildNodes()) {
      routes['/'].render(app);
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
    return;
  }

  const [path, query = ''] = (hash.slice(1) || '/').split('?');
  window.scrollTo(0, 0);
  cleanup?.();
  cleanup = null;

  if (path.startsWith('/horario/')) {
    document.title = 'Seu horário · Barbearia Alvorada';
    description.content = HOME_DESCRIPTION;
    const code = decodeURIComponent(path.slice('/horario/'.length));
    renderHorario(app, code, { isNew: query === 'novo' });
    if (query === 'novo') history.replaceState(null, '', `#/horario/${encodeURIComponent(code)}`);
    return;
  }

  const route = routes[path] ?? routes['/'];
  document.title = route.title;
  description.content = route.description ?? HOME_DESCRIPTION;
  cleanup = route.render(app) ?? null;
}

window.addEventListener('hashchange', router);
router();
