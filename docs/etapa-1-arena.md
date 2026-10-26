# Etapa 1: Arena de animações (prompt 02)

O contexto fica entre o cardápio e o StockFlow:

- **O cliente** usa o site uma ou duas vezes por mês, no celular, e quer marcar rápido. As animações têm que **mostrar onde ele está no fluxo** e confirmar cada toque, nunca fazer esperar.
- **O dono** usa o painel o dia inteiro. Lá vale o padrão do StockFlow: quase nada se mexe.

O momento marcante do site é **a confirmação**: é ali que a pessoa sente que "deu certo". O resto é discreto.

As durações são escolhas de projeto, não números de pesquisa.

## Página da barbearia

### Duelo 1: topo

| Item | Vídeo em loop | Foto parada + título com fade |
|---|---|---|
| Efeito na navegação | Bonito, mas pesado | Carrega na hora |
| Frequência | 1x por visita | 1x por visita |
| Prós para o tema | — | O objetivo aqui é levar ao "Agendar", não impressionar com o produto |
| Contras | Repete o que o cardápio já mostra no portfólio | Menos impacto |
| **🏆 Vencedora** | | **Foto + fade e subida de 12 px no título, 400 ms, uma vez** |

### Duelo 2: seções ao rolar

| Item | Seções aparecendo ao rolar | Nenhuma animação |
|---|---|---|
| Frequência | 1x por visita | — |
| Contras | Atrasa a leitura dos preços | — |
| **🏆 Vencedora** | | **Nenhuma**: o destaque fica para a confirmação |

## Agendar

### Duelo 3: troca de passo (1 → 2 → 3 → 4)

| Item | Passo desliza para o lado | Troca seca |
|---|---|---|
| Efeito na navegação | Mostra que a pessoa **avançou** (ou voltou) | A tela muda sem explicar |
| Frequência | 3 a 6 vezes por agendamento | — |
| Prós para o tema | O fluxo é uma sequência; o movimento lateral reforça isso | Mais simples |
| Contras | Precisa ser rápido | Parece "piscar" |
| **🏆 Vencedora** | **Desliza 24 px + fade, 250 ms**, para a direita ao avançar e para a esquerda ao voltar. A barra de progresso cresce junto (`scaleX`) | |

### Duelo 4: carregando os horários do dia

| Item | Skeleton da grade | Spinner |
|---|---|---|
| Efeito na navegação | Mostra onde os horários vão aparecer; nada "pula" | Só diz "espera" |
| Frequência | A cada dia escolhido | — |
| **🏆 Vencedora** | **Skeleton** com o formato dos botões de horário (sem brilho em "reduzir movimento") | |

### Duelo 5: escolher um horário

| Item | Botão escolhido muda de cor e "afunda" | Check aparece no botão |
|---|---|---|
| Frequência | 1 a 3 vezes por agendamento | — |
| Prós | Confirma o toque na hora | Mais explícito |
| Contras | — | Ícone pequeno demais num botão de 4 caracteres ("14:30") |
| **🏆 Vencedora** | **Escala 0,97 ao pressionar (120 ms) + cor sólida no escolhido** + resumo "Sexta, 14:30" atualizado embaixo | |

### Duelo 6: horário pego por outra pessoa

| Item | Botão "treme" (shake) | Aviso no topo da grade + horário riscado |
|---|---|---|
| Efeito na navegação | Chama atenção | Explica o que houve e o que fazer |
| Frequência | Raro | Raro |
| Contras | Shake não diz **por que** deu errado; parece erro da pessoa | — |
| **🏆 Vencedora** | | **Aviso "Esse horário acabou de ser reservado. Escolha outro"** + o horário some da grade com fade de 200 ms + foco volta para a grade |

### Duelo 7: confirmação (o momento marcante)

| Item | Confete | Cartão do horário "entrando" + check desenhado |
|---|---|---|
| Efeito na navegação | Festa, mas cobre a tela | Mostra **o que foi marcado**, que é a informação que importa |
| Frequência | 1x por agendamento | 1x por agendamento |
| Prós para o tema | Divertido | Parece um cartão de consulta de verdade; vira o "comprovante" |
| Contras | Clichê; atrapalha leitor de tela | Mais trabalho |
| **🏆 Vencedora** | | **Cartão sobe 24 px com fade (400 ms); o círculo do check aparece com escala 0,6 → 1 (300 ms) e o traço do check cresce (`scaleX`, 250 ms); depois os botões entram um a um (60 ms entre eles)** |

## Meu horário (cancelar)

### Duelo 8: confirmar o cancelamento

| Item | Modal "Tem certeza?" | Botão vira "Toque de novo para cancelar" |
|---|---|---|
| Frequência | Raro | Raro |
| Contras | Mais um passo | Fácil de tocar duas vezes sem querer |
| **🏆 Vencedora** | **Modal**, 200 ms com escala 0,96 → 1; o foco vai para "Manter horário" | |

## Painel do dono

Mesmo padrão do StockFlow: modal com entrada e saída, aviso flutuante ao salvar e botões com escala ao pressionar.

### Duelo 9: linha do "agora" na agenda do dia

| Item | Linha que anda sozinha (atualiza a cada minuto) | Linha parada |
|---|---|---|
| Frequência | O dia todo | — |
| Prós | O dono vê de relance quem é o próximo | — |
| Contras | Movimento constante | Fica errada depois de alguns minutos |
| **🏆 Vencedora** | **Linha que anda**, com `transform: translateY` a cada minuto, sem transição (pulo de 1 minuto é imperceptível) | |

## 🏆 Equipe campeã

| # | Animação | Onde | Duração | Com "reduzir movimento" |
|---|---|---|---|---|
| 1 | Fade + subida | Título do topo | 400 ms, 1x | Só o fade |
| 2 | Passo desliza + barra de progresso | Agendar | 250 ms | Só o fade |
| 3 | Skeleton | Grade de horários | enquanto carrega | Sem brilho |
| 4 | Escala ao pressionar | Botões e horários | 120 ms | Igual |
| 5 | Horário some + aviso | Horário pego por outra pessoa | 200 ms | Some sem fade |
| 6 | **Cartão de confirmação com check** | Confirmado | ~1 s no total | Aparece pronto |
| 7 | Modal | Cancelar e painel | 200 ms | Fade |
| 8 | Linha do "agora" | Painel | a cada minuto | Igual (não anima) |

**Curvas:** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` em tudo que entra. Nunca `ease-in` em entrada.

**Cortadas:** vídeo no topo, seções ao rolar, shake, confete e hover nos cards.
