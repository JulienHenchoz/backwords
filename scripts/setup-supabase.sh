#!/usr/bin/env bash
# Met en place le backend du mode en ligne sur un projet Supabase existant
# (voir docs/ONLINE.md). Prérequis faits dans le dashboard : connexions
# anonymes activées, extensions pg_cron et pg_net activées.
#
# Usage :
#   SUPABASE_ACCESS_TOKEN=... SUPABASE_DB_PASSWORD=... \
#     scripts/setup-supabase.sh <project-ref> <email-de-contact>
#
# Écrit .env.local (clés publiques uniquement), .supabase-secrets.local (clé
# VAPID privée et CRON_SECRET, à conserver) et cron-setup.sql.local (à coller
# dans SQL Editor). Ces fichiers sont ignorés par git.

set -euo pipefail

REF="${1:?Usage: $0 <project-ref> <email>}"
EMAIL="${2:?Usage: $0 <project-ref> <email>}"
: "${SUPABASE_ACCESS_TOKEN:?Définis SUPABASE_ACCESS_TOKEN (dashboard → Account → Access Tokens)}"
: "${SUPABASE_DB_PASSWORD:?Définis SUPABASE_DB_PASSWORD (mot de passe de la base du projet)}"

cd "$(dirname "$0")/.."
SECRETS_FILE=.supabase-secrets.local
URL="https://${REF}.supabase.co"
SUPABASE="npx --yes supabase@2"

echo "→ Liaison au projet ${REF}"
$SUPABASE link --project-ref "$REF" --password "$SUPABASE_DB_PASSWORD"

echo "→ Migrations"
$SUPABASE db push --password "$SUPABASE_DB_PASSWORD"

# Réutilise les clés d'un précédent passage : en régénérer invaliderait les
# abonnements push existants.
if [[ -f "$SECRETS_FILE" ]]; then
  echo "→ Réutilisation des secrets de ${SECRETS_FILE}"
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
else
  echo "→ Génération des clés VAPID et du CRON_SECRET"
  KEYS="$(npx --yes web-push@3.6.7 generate-vapid-keys --json)"
  VAPID_PUBLIC_KEY="$(node -e 'console.log(JSON.parse(process.argv[1]).publicKey)' "$KEYS")"
  VAPID_PRIVATE_KEY="$(node -e 'console.log(JSON.parse(process.argv[1]).privateKey)' "$KEYS")"
  CRON_SECRET="$(openssl rand -hex 32)"
  umask 077
  cat > "$SECRETS_FILE" <<EOF
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
CRON_SECRET=${CRON_SECRET}
EOF
fi

echo "→ Secrets des Edge Functions"
$SUPABASE secrets set --project-ref "$REF" \
  "VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}" \
  "VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}" \
  "VAPID_SUBJECT=mailto:${EMAIL}" \
  "CRON_SECRET=${CRON_SECRET}"

echo "→ Déploiement des Edge Functions"
$SUPABASE functions deploy notify --project-ref "$REF"
$SUPABASE functions deploy cleanup --project-ref "$REF"

echo "→ Préparation de la planification du ménage quotidien"
CRON_SQL=cron-setup.sql.local
{
  echo "-- Idempotent : remplace les secrets et la tâche s'ils existent déjà."
  echo "delete from vault.secrets where name in ('backwords_project_url', 'backwords_cron_secret');"
  echo "select cron.unschedule('backwords-cleanup') where exists (select 1 from cron.job where jobname = 'backwords-cleanup');"
  echo "select vault.create_secret('${URL}', 'backwords_project_url');"
  echo "select vault.create_secret('${CRON_SECRET}', 'backwords_cron_secret');"
  # Reprend la planification de supabase/cron.sql, sans ses create_secret.
  grep -v 'vault.create_secret' supabase/cron.sql
} > "$CRON_SQL"
chmod 600 "$CRON_SQL"

echo "→ Vérification de la fonction cleanup"
curl -fsS -X POST "${URL}/functions/v1/cleanup" -H "x-cron-secret: ${CRON_SECRET}" && echo

echo "→ Écriture de .env.local"
ANON_KEY="$($SUPABASE projects api-keys --project-ref "$REF" -o json \
  | node -e 'const k=JSON.parse(require("fs").readFileSync(0,"utf8")); const a=k.find(x=>x.name==="anon")||k.find(x=>x.type==="publishable"); console.log(a?.api_key??"")')"
cat > .env.local <<EOF
VITE_SUPABASE_URL=${URL}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
EOF

echo
echo "✅ Terminé. Variables à reporter chez l'hébergeur du front :"
cat .env.local
echo
echo "Secrets privés conservés dans ${SECRETS_FILE} (ne pas committer)."
echo
echo "Dernière étape : colle le contenu de ${CRON_SQL} dans SQL Editor du dashboard et exécute-le."
