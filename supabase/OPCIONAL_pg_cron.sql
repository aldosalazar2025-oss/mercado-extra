-- OPCIONAL · Vencimiento automático cada 5 minutos con pg_cron.
-- 1) En Supabase: Database > Extensions > busca "pg_cron" y actívalo.
-- 2) Ejecuta esto en el SQL Editor (una sola vez, solo en el proyecto que quieras):
select cron.schedule('vencer-solicitudes', '*/5 * * * *', $$select public.vencer_solicitudes()$$);
-- Para quitarlo: select cron.unschedule('vencer-solicitudes');
-- Sin pg_cron igual funciona: la web llama a vencer_solicitudes() cada vez que un comprador abre "Mis solicitudes".
