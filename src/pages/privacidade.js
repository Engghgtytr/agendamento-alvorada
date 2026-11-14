import { siteFooter, siteHeader } from '../components/layout.js';
import { toast } from '../components/toast.js';
import { isDemo, loadShop } from '../services/api.js';
import { esc } from '../utils/format.js';
import { labels } from '../utils/labels.js';

// Aviso de privacidade em linguagem simples (comando /privacy-notice do guia do
// professor + arquivo 06 do kit). Tem que bater com o que o site faz de verdade.
// O texto muda com a loja (barbearia ou pet shop).
// Não devolve a Promise: o roteador trata o retorno como função de limpeza.
export function renderPrivacidade(app) {
  draw(app);
}

async function draw(app) {
  const shop = (await loadShop()) ?? { name: 'Barbearia Alvorada' };
  if (!location.hash.startsWith('#/privacidade')) return; // a pessoa já foi para outra página
  const l = labels(shop);
  const pet = Boolean(shop.petMode);
  const A = l.to.charAt(0).toUpperCase() + l.to.slice(1);

  app.innerHTML = `
    ${siteHeader({ nav: false })}
    <main id="conteudo" class="prose wrap">
      <h1>Privacidade</h1>
      <p class="lead">${A} ${esc(shop.name)} é ${l.fictional}, mas o site trata os dados como um site de verdade trataria.</p>

      <h2>Que dados guardamos</h2>
      <p>Só o que é preciso para o horário: <strong>seu nome</strong> e <strong>seu WhatsApp</strong>, junto com o serviço, ${l.staffOne}, o dia e a hora escolhidos${pet ? ', além do <strong>nome, porte e raça do pet</strong>' : ''}. Não pedimos e-mail, CPF nem data de nascimento.</p>

      <h2>Para quê</h2>
      <p>Para ${l.to} saber quem vem e conseguir falar com você se precisar mudar o horário. Não usamos para propaganda e não passamos para ninguém.</p>

      <h2>Onde ficam e quem vê</h2>
      ${
        isDemo
          ? '<p>Neste modo demonstração, os dados ficam <strong>só no seu navegador</strong> (no armazenamento local do site). Nada vai para um servidor.</p>'
          : `<p>Num banco de dados protegido. Só o dono ${l.of}, com login, consegue ver a agenda. Quem agenda não vê os horários de outras pessoas, só quais horários estão livres.</p>`
      }

      <h2>Por quanto tempo</h2>
      <p>Seu nome e seu WhatsApp${pet ? ' (e o nome e a raça do pet)' : ''} são apagados <strong>30 dias depois do horário</strong>. Fica só o registro sem identificação (serviço, dia e se o horário foi atendido), para ${l.to} organizar a agenda.</p>

      <h2>Como cancelar ou pedir para apagar</h2>
      <p>Pelo link que aparece depois de agendar, você vê e cancela o horário até 2 horas antes. Para apagar seus dados antes do prazo, fale com ${l.to}.</p>
      ${
        isDemo
          ? `<p>No modo demonstração, você mesmo apaga tudo o que marcou neste navegador:</p>
             <button class="btn btn--outline" type="button" id="wipe">Apagar meus agendamentos de teste</button>`
          : ''
      }

      <h2>Cookies</h2>
      <p>Cookies são pequenos arquivos que um site pede para o navegador guardar e devolver nas próximas visitas, para lembrar quem você é. Os de <strong>terceiros</strong> são os usados por propaganda para seguir você de site em site.</p>
      <p><strong>Este site não usa cookies</strong>, nem próprios nem de terceiros, e não tem propaganda, Google Analytics ou pixel de rede social. Por isso não aparece aviso de cookies.</p>
      <p>O que ele usa é o <strong>armazenamento local do navegador</strong>, só para o funcionamento: lembrar os passos do agendamento enquanto você marca${isDemo ? ' e guardar os horários de teste' : ' e manter o dono conectado no painel'}. Isso não sai do seu aparelho para ninguém além ${l.of}, e você apaga quando quiser limpando os dados do site no navegador.</p>
    </main>
    ${siteFooter}`;

  app.querySelector('#wipe')?.addEventListener('click', () => {
    try {
      localStorage.removeItem('alvorada:demo:v1');
      localStorage.removeItem('alvorada:demo-pet:v1');
      sessionStorage.removeItem('alvorada:agendar:v1');
    } catch {
      // armazenamento bloqueado: não há o que apagar
    }
    toast('Agendamentos de teste apagados deste navegador.');
  });
}
