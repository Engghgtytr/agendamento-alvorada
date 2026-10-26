// Aviso curto no rodapé da tela. O contêiner tem aria-live, então leitores de tela
// leem o texto sem tirar o foco de onde a pessoa está.
export function toast(message, ms = 3200) {
  const box = document.getElementById('toasts');
  const el = document.createElement('p');
  el.className = 'toast';
  el.textContent = message;
  box.append(el);
  setTimeout(() => {
    el.classList.add('toast--out');
    setTimeout(() => el.remove(), 220);
  }, ms);
}
