// Partes que se repetem: logo, topo e rodapé.

export const logo = `
  <a class="logo" href="#/" aria-label="Barbearia Alvorada, página inicial">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="10" fill="#1d5c58"/>
      <path d="M14 42a18 18 0 0 1 36 0z" fill="#f2c14e"/>
      <path d="M10 46h44" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    </svg>
    <span>Alvorada</span>
  </a>`;

export function siteHeader({ nav = true } = {}) {
  return `
    <header class="site-header">
      <div class="wrap">
        ${logo}
        <nav class="site-nav" aria-label="Principal">
          ${nav ? '<a href="#servicos">Serviços</a><a href="#equipe">Equipe</a><a href="#horario">Horário</a>' : ''}
          <a class="btn btn--primary" href="#/agendar">Agendar</a>
        </nav>
      </div>
    </header>`;
}

export const siteFooter = `
  <footer class="site-footer">
    <div class="wrap">
      <p><strong>A Barbearia Alvorada é fictícia.</strong> Este site é um projeto de portfólio da Penchel.Dev: os horários marcados aqui não valem de verdade.</p>
      <nav aria-label="Rodapé">
        <a href="#/agendar">Agendar horário</a>
        <a href="#/privacidade">Privacidade</a>
      </nav>
    </div>
  </footer>`;

// Ícones (traço, estilo Lucide)
export const icons = {
  back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  calendar: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  message: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  link: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
