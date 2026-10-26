# Comandos do guia do professor aplicados no projeto

Guia: *1200 Comandos de IA*, Prof. Álvaro Machado Júnior (`Documents\Prompts para Sites e Animações\1200_Comandos_IA_Prof_Alvaro_Machado_Junior.pdf`).

O guia é uma lista de atalhos (`/comando`) que dizem à IA o que fazer. Estes são os que servem para um sistema de agendamento, e onde cada um entra:

| Comando | Nº | O que pede | Onde foi usado |
|---|---|---|---|
| `/edge-cases` | 0766 | Casos extremos | Etapa 2: virada de mês e ano, ano bissexto, horário que só encosta em outro, almoço, antecedência mínima, dia fora da janela, serviço maior que o expediente |
| `/test-cases` e `/unit-tests` | 0798, 0800 | Cenários e testes | Etapa 2: 35 testes (`tests/`), incluindo dois clientes no mesmo horário |
| `/accessibility-code` | 0751 | Acessibilidade | Etapa 2: rádios nativos (setas do teclado funcionam), foco no título de cada passo, erro ligado ao campo, `aria-live` na grade |
| `/responsive` | 0790 | Várias telas | Etapa 2: testado em 390 px (celular) e 1366 px (PC), sem rolagem lateral |
| `/privacy-notice` e `/lgpd-check` | 1083, 1072 | Aviso de privacidade e LGPD | Etapa 2: página `#/privacidade`, coleta mínima (nome e WhatsApp), apagar dados de teste |
| `/database-schema` | 0759 | Tabelas, relações e restrições | Etapa 4: tabelas, exclusion constraint |
| `/threat-model` e `/least-privilege` | 1095, 1071 | Ameaças e menor privilégio | Etapa 4: RLS, função `book_appointment` como única porta de entrada |
| `/integration-tests` | 0777 | Testes de integração | Etapa 4: testes no PostgreSQL embutido (PGlite), como no cardápio |
| `/secure-code` e `/owasp-top10` | 1087, 1078 | Revisão de segurança | Etapa 6: revisão final com o arquivo 06 do kit |
| `/readme` | 0787 | README | Etapa 7 |
| `/git-commit` | 0773 | Mensagem de commit | Etapa 7, quando você pedir para publicar |

A fórmula **P.C.T.F.R.** do guia (Papel, Contexto, Tarefa, Formato, Restrições) é a mesma ideia do bloco "Meu contexto" do prompt 01 do kit: quanto mais contexto, melhor a resposta.
