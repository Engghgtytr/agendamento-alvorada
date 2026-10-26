import { siteFooter, siteHeader } from '../components/layout.js';
import { toast } from '../components/toast.js';
import { isDemo } from '../services/api.js';

// Aviso de privacidade em linguagem simples (comando /privacy-notice do guia do
// professor + arquivo 06 do kit). Tem que bater com o que o site faz de verdade.
export function renderPrivacidade(app) {
  app.innerHTML = `
    ${siteHeader({ nav: false })}
    <main id="conteudo" class="prose wrap">
      <h1>Privacidade</h1>
      <p class="lead">A Barbearia Alvorada é fictícia, mas o site trata os dados como um site de verdade trataria.</p>

      <h2>Que dados guardamos</h2>
      <p>Só o que é preciso para o horário: <strong>seu nome</strong> e <strong>seu WhatsApp</strong>, junto com o serviço, o barbeiro, o dia e a hora escolhidos. Não pedimos e-mail, CPF nem data de nascimento.</p>

      <h2>Para quê</h2>
      <p>Para a barbearia saber quem vem e conseguir falar com você se precisar mudar o horário. Não usamos para propaganda e não passamos para ninguém.</p>

      <h2>Onde ficam e quem vê</h2>
      ${
        isDemo
          ? '<p>Neste modo demonstração, os dados ficam <strong>só no seu navegador</strong> (no armazenamento local do site). Nada vai para um servidor.</p>'
          : '<p>Num banco de dados protegido. Só o dono da barbearia, com login, consegue ver a agenda. Quem agenda não vê os horários de outras pessoas, só quais horários estão livres.</p>'
      }

      <h2>Por quanto tempo</h2>
      <p>Seu nome e seu WhatsApp são apagados <strong>30 dias depois do horário</strong>. Fica só o registro sem identificação (serviço, dia e se o horário foi atendido), para a barbearia organizar a agenda.</p>

      <h2>Como cancelar ou pedir para apagar</h2>
      <p>Pelo link que aparece depois de agendar, você vê e cancela o horário até 2 horas antes. Para apagar seus dados antes do prazo, fale com a barbearia.</p>
      ${
        isDemo
          ? `<p>No modo demonstração, você mesmo apaga tudo o que marcou neste navegador:</p>
             <button class="btn btn--outline" type="button" id="wipe">Apagar meus agendamentos de teste</button>`
          : ''
      }

      <h2>Cookies</h2>
      <p>O site não usa cookies de rastreamento nem ferramentas de propaganda, por isso não há aviso de cookies.</p>
    </main>
    ${siteFooter}`;

  app.querySelector('#wipe')?.addEventListener('click', () => {
    try {
      localStorage.removeItem('alvorada:demo:v1');
      sessionStorage.removeItem('alvorada:agendar:v1');
    } catch {
      // armazenamento bloqueado: não há o que apagar
    }
    toast('Agendamentos de teste apagados deste navegador.');
  });
}
