import { createDemoApi } from './demo-api.js';

// Só variáveis PÚBLICAS (prefixo VITE_) chegam ao navegador.
// A chave anon/publishable pode ficar no frontend porque quem protege os dados é o RLS.
// NUNCA use aqui a chave service_role: ela ignora o RLS.
const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const isValidUrl = (value) => /^https:\/\/\S+$/.test(value ?? '');

if (url && !isValidUrl(url)) {
  console.error('VITE_SUPABASE_URL não é uma URL válida. Usando só o modo demonstração.');
}

export const isDemo = !(isValidUrl(url) && key);

const PUBLIC = ['getShop', 'getDays', 'getSlots', 'book', 'getBooking', 'confirm', 'cancel'];
const ADMIN = ['getShop', 'getDay', 'setStatus', 'markReminded', 'setConfirmed', 'addTimeOff', 'removeTimeOff', 'saveService', 'saveHours'];

// Demonstração do modo pet shop: abra o site com ?loja=pet, ou faça o build com VITE_LOJA=pet (site só do pet shop)
const lojaPedida = new URLSearchParams(globalThis.location?.search ?? '').get('loja') ?? import.meta.env?.VITE_LOJA;
export const demoLoja = lojaPedida === 'pet' ? 'pet' : 'barbearia';
const SESSION = ['current', 'signIn', 'signOut'];

// Com Supabase, a biblioteca dele só é baixada quando a primeira função é chamada.
// No modo demonstração ela nem entra no carregamento: o site fica mais leve.
function lazySupabaseApi() {
  let ready = null;
  const load = () => (ready ??= import('./supabase-api.js').then((m) => m.createSupabaseApi(url, key)));
  const group = (names, pick) =>
    Object.fromEntries(names.map((name) => [name, async (...args) => pick(await load())[name](...args)]));
  return {
    mode: 'supabase',
    ...group(PUBLIC, (api) => api),
    admin: group(ADMIN, (api) => api.admin),
    session: group(SESSION, (api) => api.session),
  };
}

// No modo demonstração qualquer pessoa entra no painel, sem senha, e as mudanças
// ficam só no navegador dela. A "sessão" dura até fechar a aba.
const DEMO_SESSION = 'alvorada:painel-demo';

function demoApi() {
  const api = createDemoApi({ loja: demoLoja });
  api.session = {
    async current() {
      try {
        return sessionStorage.getItem(DEMO_SESSION) ? { email: '', isAdmin: true, demo: true } : null;
      } catch {
        return null;
      }
    },
    async signIn() {
      try {
        sessionStorage.setItem(DEMO_SESSION, '1');
      } catch {
        // sem sessionStorage: a demonstração dura até recarregar
      }
      return { email: '', isAdmin: true, demo: true };
    },
    async signOut() {
      try {
        sessionStorage.removeItem(DEMO_SESSION);
      } catch {
        // nada a fazer
      }
    },
  };
  return api;
}

export const api = isDemo ? demoApi() : lazySupabaseApi();
