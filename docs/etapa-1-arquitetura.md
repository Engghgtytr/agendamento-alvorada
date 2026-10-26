# Etapa 1: arquitetura (prompt 01)

Projeto: **agendamento online** da **Barbearia Alvorada**, uma barbearia **fictícia** usada como demonstração de portfólio da Penchel.Dev.

## Contexto

| Item | Decisão |
|---|---|
| Público | Clientes da barbearia, quase todos no **celular**, vindos do Instagram, do Google ou de um link no WhatsApp |
| Objetivo do cliente | Marcar um horário em **menos de 1 minuto**, sem criar conta e sem ligar |
| Objetivo do dono | Ver a agenda do dia, bloquear horários (almoço, folga) e mudar serviços e preços **sozinho** |
| Objetivo do portfólio | Mostrar lógica de datas e horários e a garantia de que **dois clientes nunca pegam o mesmo horário**, mesmo clicando ao mesmo tempo |
| Loja | Uma só, com 2 ou 3 barbeiros fictícios |

## Categoria e formato técnico

**Categoria:** Plataforma de serviço (agendamento) + página de negócio local + painel administrativo.

**Formato:** **dinâmico com banco de dados** (Supabase). O cliente cria um agendamento e o dono vê o que foi criado, então os dados precisam ficar num servidor.

| Formato | Vantagem | Desvantagem | Decisão |
|---|---|---|---|
| Só um botão "Agendar pelo WhatsApp" | Simples, sem banco | O dono continua marcando na mão e erra horário | ❌ |
| **Agenda própria com banco + painel** | Horários livres calculados sozinhos; o banco impede horário duplicado | Precisa de login (só para o dono), banco e cuidado com dados pessoais | ✅ |
| Agenda com pagamento antecipado (sinal) | Reduz faltas | Nível 4 de segurança (pagamento), taxas e responsabilidade legal | ❌ Não fazer agora |

Tecnologias: as mesmas do StockFlow e do cardápio (HTML, CSS e JavaScript em módulos, Vite, Supabase, Vitest e Vercel).

**Diferença importante em relação ao cardápio:** aqui o site **guarda dados de clientes** (nome e WhatsApp). Isso traz a LGPD para dentro do projeto: coleta mínima, página de privacidade, prazo para apagar os dados e nenhum dado de cliente visível para quem não é o dono.

## Mapa de telas

```text
PÁGINA DA BARBEARIA  #/                  (quem vem do Instagram ou do Google)
  1. Topo: foto · nome · "aberto agora" · [Agendar horário]
  2. Serviços: nome, duração e preço (corte, barba, corte + barba…)
  3. Equipe: barbeiros fictícios, com o que cada um faz
  4. Onde estamos: horário de funcionamento e aviso de loja fictícia
  5. Rodapé: "Projeto de portfólio da Penchel.Dev; barbearia fictícia" · Privacidade

AGENDAR  #/agendar                      (4 passos, com barra de progresso)
  1. Serviço
  2. Profissional (ou "qualquer um disponível")
  3. Dia e horário: faixa com os próximos 21 dias + grade de horários livres
  4. Seus dados: nome e WhatsApp · resumo · [Confirmar agendamento]
  → Confirmado: cartão com dia, hora, serviço e barbeiro
     · [Adicionar à agenda do celular] (arquivo .ics)
     · [Avisar a barbearia no WhatsApp]
     · link para cancelar

MEU HORÁRIO  #/horario/<código>          (link secreto, sem login)
  · Ver o agendamento · [Cancelar] até 2 horas antes

PAINEL DO DONO  #/admin                  (com login)
  · Agenda do dia: uma coluna por barbeiro, linha do "agora"
  · Agendamento: atendido / faltou / cancelar · [Chamar no WhatsApp]
  · Bloquear horário: almoço, folga, feriado
  · Serviços: criar, editar, duração, preço, ativo
  · Barbeiros e horário de trabalho de cada um
  · Loja: nome, WhatsApp, antecedência mínima, prazo de cancelamento

PRIVACIDADE  #/privacidade
  · Que dados guardamos, para quê, por quanto tempo e como pedir para apagar
```

## Modelo de dados (Supabase)

```text
shop_settings  (1 linha)  nome, whatsapp, fuso (America/Sao_Paulo), intervalo da grade (15 min),
                          janela de agendamento (21 dias), antecedência mínima (60 min),
                          prazo para cancelar (120 min)
services                  id, nome, duração_min, price_cents, ativo, posição
barbers                   id, nome, foto, ativo, posição
working_hours             barber_id, dia_da_semana, início, fim
                          (duas linhas no mesmo dia = intervalo de almoço)
time_off                  id, barber_id, início, fim, motivo        → bloqueios
appointments              id, barber_id, service_id, início, fim, nome, whatsapp,
                          status (marcado / atendido / faltou / cancelado),
                          preço e duração copiados na hora (o histórico não muda se o preço mudar),
                          hash do código de cancelamento, criado_em
admins                    user_id   → quem pode ver e editar a agenda
```

Horários guardados em `timestamptz` (data e hora com fuso). Preços em **centavos inteiros**, como nos outros projetos.

## A parte "sênior": nunca dois clientes no mesmo horário

O problema clássico: duas pessoas veem o horário das 14h livre e clicam em "confirmar" no mesmo segundo. Se o site só conferir "está livre?" e depois gravar, os dois passam.

A solução tem três camadas:

1. **Regra no próprio banco (a garantia de verdade):** uma *exclusion constraint* na tabela `appointments` proíbe dois agendamentos ativos do mesmo barbeiro com horários que se sobrepõem. Mesmo que tudo o resto falhe, o PostgreSQL recusa o segundo.
2. **Função `book_appointment` no banco:** é o único jeito de o cliente criar um agendamento. Ela confere se o horário está dentro do expediente, não cai num bloqueio, respeita a antecedência mínima e a janela de 21 dias, e trava a agenda daquele barbeiro durante a gravação.
3. **Na tela:** se o horário foi pego por outra pessoa, aparece "Esse horário acabou de ser reservado. Escolha outro" e a grade recarrega. Nada de erro técnico.

Testes automatizados vão simular os dois cliques ao mesmo tempo e conferir que só um passa.

## Segurança e privacidade

| Regra | Como |
|---|---|
| Cliente não vê dados de outros clientes | A tabela `appointments` **não tem leitura pública** (RLS). A grade de horários vem de uma função que devolve **só os horários livres**, sem nomes |
| Cliente não cria agendamento "torto" | Sem `insert` direto na tabela: só pela função `book_appointment`, que valida tudo |
| Cancelar sem login | Um código aleatório longo vai no link. O banco guarda só o **hash** dele, como uma senha |
| Robôs enchendo a agenda | Campo escondido (honeypot), no máximo 2 agendamentos futuros por WhatsApp e limite por minuto na função |
| Coleta mínima (LGPD) | Só nome e WhatsApp. Sem e-mail, CPF ou data de nascimento |
| Apagar dados | Nome e WhatsApp são apagados **30 dias depois** do horário; fica só a estatística (serviço, dia, status) |
| Painel do dono | Login do Supabase, cadastro público desligado, só quem está em `admins` vê a agenda |
| Chaves | Só a chave `anon` no front-end; `.env` no `.gitignore`; nada de `service_role` no navegador |

## Modo demonstração

Como nos outros projetos, o site funciona **sem Supabase**: os dados ficam num banco falso no próprio navegador, com as mesmas regras (inclusive a de horário duplicado). Assim qualquer recrutador testa na hora.

No modo demonstração, o botão do WhatsApp **mostra a mensagem** que seria enviada, em vez de abrir uma conversa com um número que pode ser de uma pessoa real.

## Funcionalidades por prioridade

**Obrigatório**
- Página da barbearia com serviços, equipe e horário
- Agendar em 4 passos, com horários livres calculados pelo expediente, bloqueios e agendamentos
- Garantia contra horário duplicado (constraint + função + teste de concorrência)
- Tela de confirmação com arquivo `.ics` e link para cancelar
- Painel do dono: agenda do dia, status, bloqueios, serviços, barbeiros e expediente
- Página de privacidade e apagamento automático dos dados pessoais
- Funciona bem no celular, com teclado e com "reduzir movimento"

**Se der tempo**
- "Qualquer um disponível" escolhendo o barbeiro com a agenda mais vazia
- Remarcar pelo link (hoje: cancelar e marcar de novo)
- Botão no painel "Mandar lembrete" com a mensagem pronta no WhatsApp
- Painel com o resumo da semana (agendamentos e faltas)

**Não fazer agora**
- Pagamento ou sinal antecipado
- Lembrete automático por SMS ou WhatsApp (precisa de serviço pago e API oficial)
- Conta de cliente com login, várias unidades, plano de fidelidade

## Riscos e como evitar

| Risco | Como evitar |
|---|---|
| **Fuso horário errado** (horário de verão, servidor em UTC) | Tudo em `timestamptz` com o fuso `America/Sao_Paulo` definido na loja; testes com datas de virada de mês e de ano |
| Dois clientes no mesmo horário | Exclusion constraint + trava na função + teste de concorrência |
| Robô criando agendamentos falsos | Honeypot, limite por WhatsApp e por minuto; captcha (Cloudflare Turnstile) se aparecer abuso |
| O site de demonstração mandar mensagem para o WhatsApp de uma pessoa real | No modo demonstração, só mostra a mensagem |
| Vazamento de nome e telefone | Sem leitura pública da tabela; dados apagados após 30 dias; testes de RLS com um usuário sem permissão |
| O dono esquecer de bloquear o almoço | O expediente de cada barbeiro já pode ter duas faixas por dia (manhã e tarde) |
| Grade de horários lenta | Calcula só o dia escolhido, no banco, numa chamada só |

## Etapas

| Etapa | Entrega |
|---|---|
| 1 | Este planejamento + Arena de animações (`etapa-1-arena.md`) |
| 2 | Página da barbearia e fluxo de agendar, no modo demonstração |
| 3 | Lógica dos horários livres (expediente, bloqueios, antecedência) com testes |
| 4 | Supabase: tabelas, RLS, função `book_appointment`, constraint e teste de concorrência |
| 5 | Painel do dono com login: agenda do dia, status, bloqueios, serviços e expediente |
| 6 | Imagens, animações finais, acessibilidade, privacidade e revisão de segurança (prompt 06) |
| 7 | Publicação na Vercel e testes na versão publicada |
