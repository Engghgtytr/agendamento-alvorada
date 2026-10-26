-- Roda a limpeza de dados pessoais (LGPD) todo dia às 3h15 (UTC).
-- Só funciona no Supabase, que tem a extensão pg_cron. Ative antes em
-- Database > Extensions > pg_cron, ou deixe este comando ativar.
-- (Os testes locais com PGlite não rodam este arquivo: lá não existe pg_cron.)

create extension if not exists pg_cron;

select cron.schedule(
  'alvorada-anonimizar-clientes',
  '15 3 * * *',
  $$ select public.anonymize_old_appointments() $$
);
