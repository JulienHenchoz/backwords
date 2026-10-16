-- Planification du ménage quotidien (audio > 7 jours, rooms inactives > 30 jours).
--
-- À exécuter UNE FOIS dans l'éditeur SQL du dashboard Supabase, après avoir
-- remplacé les deux valeurs ci-dessous et déployé la fonction `cleanup`.
-- (Extensions requises : pg_cron et pg_net, à activer dans Database > Extensions.)

select vault.create_secret('https://<project-ref>.supabase.co', 'backwords_project_url');
select vault.create_secret('<même valeur que le secret CRON_SECRET de la fonction>', 'backwords_cron_secret');

select cron.schedule(
  'backwords-cleanup',
  '17 3 * * *', -- tous les jours à 03:17 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'backwords_project_url')
      || '/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'backwords_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
