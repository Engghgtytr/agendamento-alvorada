# Etapa 6: revisão de segurança, acessibilidade e desempenho

Feita com o arquivo 06 do kit (segurança), a regra 07 (anti-vibe) e os comandos `/secure-code`, `/owasp-top10`, `/accessibility-code` e `/lgpd-check` do guia do professor.

## Segurança (OWASP Top 10, adaptado a este site)

| Risco | Situação | Como |
|---|---|---|
| Controle de acesso quebrado | ✅ Protegido no banco | RLS em todas as tabelas; visitante não lê agendamentos; conta sem admin não vê clientes; o admin só muda o status. 23 testes no PostgreSQL (PGlite) |
| Injeção (SQL) | ✅ | Só funções com parâmetros (`rpc`), `search_path` vazio; teste com `' or 1=1 --` no código do link |
| XSS | ✅ | Todo texto vindo de fora passa por `esc()` ou `textContent`; CSP `script-src 'self'` bloqueia script injetado (testado: o script de teste injetado foi barrado) |
| Configuração insegura | ✅ | Cabeçalhos no `vercel.json`: CSP, HSTS, nosniff, Referrer-Policy `no-referrer`, Permissions-Policy, `frame-ancestors 'none'`. Erros técnicos só no console; a pessoa vê mensagem humana |
| Componentes vulneráveis | ✅ | `npm audit`: 0 falhas (atualizado `@supabase/supabase-js` para 2.118, que corrige o aviso do `auth-js`) |
| Falhas de autenticação | ✅ | Supabase Auth; cadastro público desligado (README); mensagem genérica no login. Recomendado: 2 fatores para a conta do dono |
| Segredos | ✅ | Busca por `service_role`, `secret`, `sk_`, `eyJ…`: nada no código. Só a chave `anon` no front; `.env` no `.gitignore` |
| Abuso (robôs) | ✅ | Honeypot, no máximo 2 horários futuros por WhatsApp, no máximo 30 agendamentos por minuto na barbearia toda. Se aparecer abuso: Cloudflare Turnstile |
| Link de cancelamento | ✅ | Código aleatório de 244 bits; o banco guarda só o hash (SHA-256) |

## LGPD

- Coleta mínima: nome e WhatsApp.
- Página `#/privacidade` em linguagem simples, batendo com o que o site faz.
- Nome e telefone apagados 30 dias depois do horário (`anonymize_old_appointments`, agendada pelo `pg_cron` na migration 002).
- Sem cookies de rastreamento, então sem banner de cookies.
- No modo demonstração, botão para apagar os agendamentos de teste do navegador.

## Acessibilidade (axe-core, 15 telas)

Sem nenhuma violação em: início, agendamento (passos 1 a 4, inclusive com erros), confirmação, modal de cancelar, privacidade e as três abas do painel. Corrigido nesta etapa: o aviso da demonstração no painel estava fora de uma região da página.

## Desempenho e SEO (Lighthouse, celular)

| Página | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| Início | 100 | 100 | 100 | 100 | 1,5 s | 0 |
| Agendar | 100 | 100 | 100 | 100 | 1,5 s | 0 |

- JavaScript inicial: cerca de 15 KB (gzip). O painel (7 KB) e a biblioteca do Supabase (26 KB) só são baixados quando precisam.
- Imagem de compartilhamento 1200×630, ícones (`apple-touch-icon`, 192, 512), `robots.txt`, `sitemap.xml` (quando há endereço) e `llms.txt`.
- Sem JSON-LD de negócio local: a barbearia é fictícia (regra 07).

## O que fica para quando houver Supabase de verdade

- Rodar as migrations e conferir em *Advisors → Security*.
- Testar o login do painel com duas contas (dono e não-dono).
- Ligar 2 fatores (TOTP) na conta do dono.
