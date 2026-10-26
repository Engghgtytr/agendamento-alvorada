const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Preços guardados em centavos inteiros (4500 = R$ 45,00), como no StockFlow:
// somar 0,1 + 0,2 em reais dá 0,30000000000000004; em centavos dá 30.
export const formatMoney = (cents) => brl.format(cents / 100);

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// Escapa texto antes de inserir em HTML. Evita que um nome como
// "<img onerror=...>" vire código executável (XSS).
export function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
