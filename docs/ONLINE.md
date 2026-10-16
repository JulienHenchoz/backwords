# Mode en ligne — mise en place

Le mode en ligne repose sur [Supabase](https://supabase.com) (offre gratuite suffisante) :

| Besoin | Brique Supabase |
| --- | --- |
| Joueurs sans compte | Auth — connexions anonymes |
| Rooms, mots, réponses, résultats, chat | Postgres + Row Level Security (`supabase/migrations/`) |
| Fichiers audio | Storage, bucket privé `audio` |
| Mise à jour en direct | Realtime |
| Notifications push | Edge Function `notify` + Web Push (VAPID) |
| Suppression audio à 7 jours, rooms inactives à 30 jours | Edge Function `cleanup` + pg_cron (`supabase/cron.sql`) |

## Règles du jeu en ligne

- Depuis l'accueil : **Partie en ligne** → choisir un pseudo → créer une room ou rejoindre avec un code à 6 chiffres (ou via un lien d'invitation).
- Tout le monde peut proposer des mots et deviner ceux des autres, sans fin de partie.
- Pour proposer : on s'enregistre, puis on écrit le mot (gardé secret, il sert à vérifier les réponses).
- Pour deviner : on écoute le mot à l'envers, on peut s'imiter et partager sa tentative avec la room, puis on tape sa réponse (accents, majuscules, espaces et ponctuation ignorés). Essais illimités, ou « Je donne ma langue au chat » pour voir la réponse.
- Les enregistrements sont supprimés 7 jours après la publication du mot (un rappel invite à les sauvegarder). Une room sans nouveau mot pendant 30 jours est supprimée.
- Un petit chat texte dans chaque room (50 derniers messages affichés, supprimés avec la room).
- Notifications push : nouveau mot, mot trouvé (pour son auteur), nouveau joueur. Désactivables par room.

## 1. Créer le projet Supabase

1. Crée un projet sur <https://supabase.com/dashboard> (région conseillée : Zurich `eu-central-2`).
2. **Authentication → Sign In / Providers** : active **Allow anonymous sign-ins**.
3. **Database → Extensions** : active **pg_cron** et **pg_net**.

## 2. Appliquer le schéma

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

(À défaut de CLI, copie le contenu de `supabase/migrations/20261016000000_online_rooms.sql` dans l'éditeur SQL du dashboard et exécute-le.)

## 3. Clés des notifications push

```bash
npx web-push generate-vapid-keys
```

Garde les deux clés : la publique va côté front **et** dans les secrets, la privée **uniquement** dans les secrets.

## 4. Déployer les Edge Functions

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY=<clé publique> \
  VAPID_PRIVATE_KEY=<clé privée> \
  VAPID_SUBJECT=mailto:<ton email> \
  CRON_SECRET=$(openssl rand -hex 32)

npx supabase functions deploy notify
npx supabase functions deploy cleanup
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux fonctions.

## 5. Planifier le ménage quotidien

Dans l'éditeur SQL, exécute `supabase/cron.sql` après y avoir remplacé l'URL du projet et la valeur de `CRON_SECRET`.

Pour vérifier à la main :

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup -H "x-cron-secret: <CRON_SECRET>"
```

## 6. Configurer et déployer le front

Copie `.env.example` en `.env.local` (dev) ou renseigne ces variables chez l'hébergeur :

| Variable | Où la trouver |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API Keys (clé *anon* ou *publishable*) |
| `VITE_VAPID_PUBLIC_KEY` | étape 3 |

Le front est un site statique (`npm run build` → `dist/`) : Vercel, Netlify ou Cloudflare Pages conviennent, sans configuration de réécriture (le routage passe par `#/…`). Le HTTPS est obligatoire pour le micro et les notifications.

Sans ces variables, l'app fonctionne normalement en local et le bouton « Partie en ligne » affiche un message « Mode en ligne indisponible ».

## Notes

- **iPhone** : les notifications web ne fonctionnent qu'une fois Backwords ajouté à l'écran d'accueil (iOS 16.4+). L'app l'explique dans la room.
- **Sécurité** : la réponse d'un mot n'est jamais lisible directement ; seuls l'auteur et les joueurs qui l'ont trouvée ou ont abandonné y ont accès, ainsi qu'à l'enregistrement à l'endroit. Un non-membre ne voit rien d'une room.
- **Identité** : chaque appareil a une session anonyme. Vider les données du navigateur fait perdre l'accès aux rooms ; il suffit de les rejoindre à nouveau avec leur code.
- **Audio** : les enregistrements sont convertis en WAV mono 22 kHz (~660 Ko pour 15 s) pour être lisibles sur tous les navigateurs.
