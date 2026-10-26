// Escolhas do agendamento em andamento. Ficam no sessionStorage (só nesta aba)
// para não se perderem se a pessoa recarregar ou voltar uma página (regra 07).
// Ao confirmar ou sair pelo fim do fluxo, tudo é apagado.

const KEY = 'alvorada:agendar:v1';

export function loadWizard() {
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (data && typeof data === 'object') return { step: 1, ...data };
  } catch {
    // sem sessionStorage: começa do zero
  }
  return { step: 1 };
}

export function saveWizard(state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // segue só na memória
  }
}

export function clearWizard() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada a fazer
  }
}
