# Agendamento · Barbearia Alvorada

Agendamento online para barbearia: o cliente escolhe serviço, barbeiro, dia e um horário livre em menos de um minuto, sem criar conta. A **Barbearia Alvorada é fictícia**: projeto de portfólio da Penchel.Dev.

O ponto principal: **dois clientes nunca ficam com o mesmo horário**, mesmo clicando no mesmo segundo. Quem garante é o próprio PostgreSQL, com uma *exclusion constraint*, e há testes que provam isso.

## Rodar no PC

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 61 testes: horários, validações, banco (RLS e trava) e integração
npm run build
```

No Windows, se o PowerShell bloquear o `npm`, use `npm.cmd run dev`.

Sem configurar nada, o site abre no **modo demonstração**: a agenda tem clientes de mentira e o que você marca fica salvo só no seu navegador.

## Ligar ao Supabase (opcional)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito).
2. No **SQL Editor**, rode na ordem:
   - `supabase/migrations/001_agendamento.sql` (tabelas, regras, RLS e funções)
   - `supabase/migrations/002_agendador.sql` (apaga nome e telefone 30 dias depois do horário)
   - `supabase/migrations/003_seed.sql` (dados da barbearia fictícia)
3. Em **Authentication → Providers → Email**, desligue o cadastro público (*Allow new users to sign up*).
4. Copie `.env.example` para `.env` e cole a **URL** e a chave **anon/publishable** (em *Project Settings → API*). Nunca a `service_role`.

## Como os dados são protegidos

| Quem | Pode |
|---|---|
| Visitante | Ver serviços, equipe e horários livres. Marcar só pela função `book_appointment`, que valida tudo. **Não lê** a tabela de agendamentos |
| Quem tem o link do horário | Ver e cancelar (até 2 horas antes). O banco guarda só o hash do código |
| Dono (tabela `admins`) | Ver a agenda, mudar o status, bloquear horários e editar serviços e equipe |

Coleta mínima (LGPD): só nome e WhatsApp, apagados automaticamente 30 dias depois do horário.

## Tecnologias

HTML, CSS e JavaScript em módulos, Vite, Supabase (PostgreSQL + RLS), Vitest e PGlite para testar o banco localmente.
