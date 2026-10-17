# Plan de test — Backwords

Objectif : détecter **avant les joueurs** les bugs qui cassent une partie, sur tous les appareils et quel que soit l'usage, et ne jamais réintroduire un bug déjà corrigé.

Le plan est organisé ainsi :

1. ce qu'on a appris des bugs passés ;
2. les familles de risques ;
3. la matrice des appareils et des conditions ;
4. les tests automatisés, par couche ;
5. la campagne manuelle, car l'oreille humaine reste indispensable pour l'audio ;
6. l'outillage de diagnostic et de suivi en production ;
7. la checklist de mise en production ;
8. la feuille de route de mise en place.

---

## 1. Leçons des bugs déjà rencontrés

| Bug réel | Pourquoi il est passé | Ce qui l'aurait attrapé |
| --- | --- | --- |
| iOS : « Préparation de l'écoute » infinie (`decodeAudioData` ne se résout jamais) | Testé uniquement sur Chrome | Test d'injection de pannes audio (promesse qui ne se résout jamais) + test sur Safari iOS réel |
| Play → boutons grisés pour toujours (`resume()` bloqué, `onended` jamais émis) | L'état « en lecture » dépendait d'un événement que le navigateur peut ne jamais envoyer | Invariant « aucun écran sans issue » + injection de pannes |
| Deuxième enregistrement muet (contexte audio créé avant l'ouverture du micro) | Le scénario testé ne faisait qu'**un** enregistrement | Scénarios **répétés** (enregistrer → écouter → ×2, ×3, en changeant de room) + écoute humaine |
| `Failed to resolve import "@supabase/supabase-js"` | Dépendance ajoutée sans `npm install` côté dev | Checklist de pull + CI qui part d'un clone propre (`npm ci`) |
| `relation "rooms" already exists` | Migration appliquée à la main, puis par la CLI | CI qui rejoue **toutes** les migrations sur une base vide + procédure unique de déploiement du schéma |
| Secret tronqué par `&` dans le shell | Valeur non citée | Script de setup qui cite tout + doc avec apostrophes |
| Bouton « Envoyer » qui déborde sur petit écran | Pas de test visuel à 320 px | Captures d'écran automatiques à 320 / 375 / 414 px |

**Règle qui en découle : chaque bug corrigé reçoit un test de non-régression** (automatisé si possible, sinon une entrée dans la campagne manuelle §5) avant d'être considéré comme clos.

---

## 2. Familles de risques (par ordre de gravité)

| # | Famille | Exemples d'edge cases | Gravité |
| --- | --- | --- | --- |
| R1 | **Cycle de vie audio** | contexte `suspended` / `interrupted` / `closed`, `resume()` hors geste utilisateur, appel entrant pendant l'enregistrement, écran verrouillé, casque Bluetooth branché/débranché, mode silencieux iOS, sortie par l'écouteur du haut, micro refusé puis autorisé, enregistrement de 0 s ou des 15 s pile, double appui rapide | Bloquant |
| R2 | **États sans issue** | bouton grisé à vie, « Chargement… » infini, écran sans aucun bouton après une erreur, double soumission | Bloquant |
| R3 | **Formats et compatibilité** | webm/opus (Chrome) vs mp4/aac (Safari), décodage d'un son enregistré sur un autre appareil, fréquence d'échantillonnage 44,1 / 48 kHz, navigateurs sans `OfflineAudioContext`, WebView (Instagram, WhatsApp) | Bloquant |
| R4 | **Réseau et temps réel** | hors ligne, 3G lente, coupure pendant l'upload (fichiers orphelins), WebSocket coupé en arrière-plan, deux joueurs qui répondent en même temps, rechargement au milieu d'une action | Majeur |
| R5 | **Sécurité et accès** | non-membre qui lit une room, joueur qui obtient la réponse avant d'avoir trouvé, upload sur le mot d'un autre, identifiants admin exposés dans le bundle, code de room deviné | Majeur |
| R6 | **Données et temps** | expiration à 7 j pile, room à 30 j, fuseaux horaires, mot avec accents / espaces / emoji / 60 caractères, pseudo vide ou de 20 caractères, 50+ messages | Majeur |
| R7 | **PWA, cache et notifications** | ancienne version servie par le service worker après un déploiement, notification sur iOS non installé, clic sur une notification app fermée / ouverte, abonnement expiré (410) | Majeur |
| R8 | **Configuration et déploiement** | variable d'env manquante, migration non appliquée, fonction non déployée, secret absent, dépendance non installée | Majeur |
| R9 | **Mise en page et accessibilité** | 320 px, paysage, clavier virtuel qui masque le champ, police agrandie, lecteur d'écran, contrastes | Mineur |

---

## 3. Matrice appareils × conditions

### 3.1 Navigateurs cibles

| Priorité | Plateforme | Pourquoi |
| --- | --- | --- |
| **P0** | iPhone — Safari, iOS 17 et 18 | Majorité des bugs audio ; WebKit impose ses règles |
| **P0** | iPhone — app installée sur l'écran d'accueil (PWA) | Seul mode où les notifications push marchent sur iOS ; cycle de vie différent |
| **P0** | Android — Chrome | Majorité des Android |
| P1 | iPhone — iOS 16.4 / 16.7 | Plus ancien iOS avec push web ; pas de `navigator.audioSession` |
| P1 | iPhone — Chrome et Firefox iOS | Moteur WebKit mais habillage différent |
| P1 | Android — Samsung Internet, Firefox | Implémentations audio différentes |
| P1 | Desktop — Chrome, Safari macOS, Firefox | Développement, partage d'écran en soirée |
| P2 | WebView in-app (WhatsApp, Instagram, Messenger) | Lien d'invitation ouvert depuis une messagerie : micro souvent bloqué |
| P2 | iPad, tablette Android | Mise en page, `MacIntel` + tactile |

### 3.2 Conditions à croiser avec les scénarios audio (R1)

- Mode silencieux iOS activé / désactivé
- Volume à 0 ; écouteurs filaires ; Bluetooth (AirPods) connectés **avant** puis **pendant** la partie
- Appel entrant ou alarme pendant l'enregistrement, puis pendant la lecture
- Verrouillage de l'écran pendant l'enregistrement ; passage dans une autre app et retour
- Mode économie d'énergie ; stockage presque plein
- Permission micro : jamais demandée / refusée / révoquée dans les réglages en cours de partie
- Navigation privée (stockage local qui lève des exceptions)
- Réseau : Wi-Fi, 4G, 3G lente simulée, mode avion pendant une action

On ne teste pas toutes les combinaisons : **toutes les conditions sur les plateformes P0**, et seulement les conditions marquées 🔊 (audio) sur les P1.

---

## 4. Tests automatisés

Pyramide visée : beaucoup de tests rapides en bas, peu de tests lents en haut.

```
            ┌─────────────────────────┐
            │  Appareils réels (cloud) │  nuit / avant release
          ┌─┴─────────────────────────┴─┐
          │ E2E multi-joueurs + Supabase │  à chaque PR (local)
        ┌─┴──────────────────────────────┴─┐
        │ E2E navigateur, backend simulé    │  à chaque PR
      ┌─┴──────────────────────────────────┴─┐
      │ Base de données (RLS, fonctions SQL)  │  à chaque PR
    ┌─┴──────────────────────────────────────┴─┐
    │ Unitaires + injection de pannes audio      │  à chaque commit
    └────────────────────────────────────────────┘
```

### 4.1 Unitaires (Vitest + jsdom)

| Cible | Cas à couvrir |
| --- | --- |
| `lib/audioReverse.js` | inversion exacte (échantillon par échantillon), mono/stéréo, buffer d'1 échantillon ; `withTimeout` résout / rejette / nettoie son timer ; `playBuffer` se résout via `onended` **et** via le filet de sécurité |
| `lib/wavExport.js` | en-tête WAV valide (taille, fréquence, canaux), écrêtage à ±1, conversion compacte 22 kHz mono, repli quand `OfflineAudioContext` est absent ou échoue |
| `hooks/useHashRoute.js` | toutes les routes, codes invalides, hash vide, `/#/online/123456/word/` sans id |
| `online/format.js`, `wordStatus.js` | expiration à J+7 −1 min / pile / +1 min, pluriels, room sans nom |
| `state/gameReducer.js` | rotation des joueurs sur N tours, 2 joueurs, redémarrage |

### 4.2 Injection de pannes audio (le cœur du dispositif)

Un **faux `AudioContext`** pilotable (`test/fakes/audio.js`) permet de simuler, une par une puis combinées, les pannes vues sur les vrais appareils :

| Panne simulée | Comportement attendu |
| --- | --- |
| `resume()` ne se résout jamais | contexte recréé en < 2 s, le son joue |
| `resume()` rejette | message d'erreur lisible, boutons utilisables |
| `onended` jamais émis | fin de lecture forcée après la durée du son + 1,5 s |
| `decodeAudioData` ne rappelle jamais | message après 10 s + bouton « Recommencer » |
| `decodeAudioData` échoue (format inconnu) | idem |
| état `interrupted` après ouverture du micro | contexte neuf utilisé pour la lecture suivante |
| `close()` rejette | aucune exception non gérée |
| `getUserMedia` refusé / absent / lent (5 s) | message micro, bouton réessayable, session iOS restaurée |
| `MediaRecorder` sans aucun type MIME supporté | repli sur le type par défaut |
| `onstop` jamais émis | (à corriger) délai de garde sur l'arrêt |

Chaque panne est testée sur **les cinq écrans audio** : enregistrement local, devinette locale, proposer un mot, deviner un mot, imiter un mot.

### 4.3 Invariant « aucun écran sans issue » (R2)

Test générique : pour chaque écran, on parcourt tous les états accessibles (inactif, demande micro, enregistrement, préparation, prêt, lecture, erreur, publication, publication échouée). On vérifie qu'**au moins une action est toujours cliquable** et qu'aucun état transitoire ne dure plus de N secondes sans aboutir à un état stable. C'est ce test qui aurait attrapé les deux derniers bugs.

### 4.4 Base de données (Supabase local + pgTAP)

`supabase start` lance une vraie base locale ; `supabase test db` exécute les tests `supabase/tests/*.sql`.

- **Migrations** : `supabase db reset` rejoue toutes les migrations sur une base vide (attrape « already exists », l'ordre, les oublis).
- **Matrice d'accès** (le test SQL déjà écrit, formalisé) : pour chaque rôle — anonyme, non-membre, membre, auteur du mot, joueur ayant trouvé / abandonné, `service_role` — × chaque table, fonction et chemin de stockage, l'accès attendu (✅ / ❌).
- **Règles métier** : normalisation des réponses (`Éléphant !` = `elephant`, `œuf` = `oeuf`, espaces, majuscules), essais comptés, abandon après réussite, unicité des codes de room sous concurrence (1 000 créations), nom de room nettoyé, message vide refusé.
- **Admin** : `admin_overview()` refusé à `authenticated`, exact sur un jeu de données connu.

### 4.5 Edge Functions (Deno test)

- `notify` : refuse sans JWT, ne notifie qu'une fois (`notified`), exclut l'auteur, respecte la préférence par room, supprime les abonnements 404/410, libellé avec et sans nom de room.
- `cleanup` : refuse sans secret, purge les mots de plus de 7 j (fichiers + tentatives), garde ceux de 6 j 23 h, supprime les rooms inactives depuis plus de 30 j, idempotente.
- `admin` : identifiants corrects / faux / absents / mal encodés / avec accents, délai sur échec.

### 4.6 E2E navigateur (Playwright)

Les scripts de test écrits pendant le développement deviennent une suite versionnée dans `e2e/` :

| Suite | Contenu |
| --- | --- |
| `local.spec` | partie locale complète sur 3 tours et 3 joueurs, recommencer, nouvelle partie |
| `online-mocked.spec` | backend simulé : créer / rejoindre / lien d'invitation / proposer / deviner faux puis juste / abandonner / chat / renommer / admin |
| `audio-faults.spec` | pannes de §4.2 injectées dans un vrai navigateur (scripts `e2e-stuck`, `e2e-second` actuels) |
| `repeat.spec` | **enchaînements longs** : 5 enregistrements d'affilée, aller-retour entre 2 rooms, retour arrière pendant une lecture, double-clic sur chaque bouton |
| `multiplayer.spec` | Supabase local, 3 contextes navigateur : A publie → B et C voient le mot en temps réel, B trouve → A voit le résultat, C quitte, chat croisé |
| `resilience.spec` | hors ligne pendant la publication, réseau lent, rechargement à chaque étape, session anonyme effacée |
| `visual.spec` | captures de chaque écran à 320, 375 et 414 px, en portrait et en paysage, comparées à des références |

Projets Playwright : **Chromium**, **WebKit** (le plus proche de Safari disponible en CI), et émulation **iPhone 13** et **Pixel 7**. Micro simulé (`--use-fake-device-for-media-stream`).

Limite assumée : WebKit sur Linux n'est pas Safari iOS. Il n'en reproduit ni les sessions audio, ni le mode silencieux, ni les interruptions. D'où §4.7 et §5.

### 4.7 Appareils réels dans le cloud (BrowserStack ou LambdaTest)

Avant chaque mise en production, et chaque nuit : le scénario « enregistrer → écouter → ré-enregistrer → écouter → publier → deviner » sur iPhone (iOS 16, 17, 18) et sur Android (Chrome, Samsung). On vérifie l'état du contexte audio et l'absence d'état bloqué. L'audibilité ne se vérifie pas automatiquement : elle relève du §5.

### 4.8 Contrôles de build

- `npm ci && npm run lint && npm run build` depuis un clone propre.
- Aucun secret dans `dist/` : recherche de `ADMIN_`, `service_role`, `VAPID_PRIVATE`, `CRON_SECRET`.
- Taille du bundle de la partie locale sous un seuil, pour qu'elle n'embarque pas Supabase.

---

## 5. Campagne manuelle sur appareils réels

À faire avant chaque mise en production touchant l'audio, l'enregistrement ou les notifications, sinon une fois par mois. Durée : environ 45 min avec deux téléphones, un iPhone et un Android.

Chaque ligne se note ✅ / ❌ + appareil + version dans un tableau de campagne.

### 5.1 Audio (à faire avec les oreilles)

| ID | Scénario | Attendu |
| --- | --- | --- |
| A1 | Enregistrer, écouter à l'endroit puis à l'envers | Son audible au **haut-parleur**, volume normal |
| A2 | Répéter A1 trois fois de suite | Toujours audible (régression : 2ᵉ enregistrement muet) |
| A3 | A1 dans une room, puis A1 dans une autre room | Audible dans les deux |
| A4 | Mode silencieux iOS activé, puis A1 | Comportement noté (référence) ; pas de blocage |
| A5 | AirPods connectés avant, puis débranchés pendant la lecture | Son dans les écouteurs, puis aucun blocage |
| A6 | Appel entrant (ou alarme) pendant l'enregistrement | Enregistrement arrêté proprement, possibilité de recommencer |
| A7 | Verrouiller l'écran pendant 10 s d'enregistrement, déverrouiller | Pas d'écran figé |
| A8 | Taper très vite enregistrer/arrêter (< 0,3 s) | Pas de blocage ; message si l'enregistrement est vide |
| A9 | Laisser aller jusqu'à 15 s | Arrêt automatique, son complet |
| A10 | Écouter un mot enregistré **sur l'autre appareil** (iPhone ↔ Android) | Lisible dans les deux sens |
| A11 | Refuser le micro, puis l'autoriser dans les réglages, revenir | Message clair, enregistrement possible après |
| A12 | Lancer une lecture puis appuyer sur ■, puis sur un autre son | Arrêt immédiat, le second son joue |

### 5.2 Parcours en ligne

| ID | Scénario | Attendu |
| --- | --- | --- |
| O1 | Créer une room nommée, copier le lien, l'ouvrir sur l'autre téléphone (via WhatsApp) | Arrivée sur « Rejoindre la room » |
| O2 | Rejoindre avec un code faux, puis juste | Message d'erreur, puis entrée |
| O3 | A publie un mot → B le voit sans recharger | < 3 s |
| O4 | B devine faux deux fois, puis juste | Compteur d'essais, révélation, A voit « Trouvé en 3 essais » |
| O5 | C abandonne | Réponse affichée, original audible |
| O6 | Partager une tentative ; l'écouter depuis un autre joueur | Audible à l'endroit et à l'envers |
| O7 | Chat : messages croisés, message de 500 caractères, emoji | Ordre correct, retour à la ligne correct |
| O8 | Renommer la room depuis B | A voit le nouveau nom en direct |
| O9 | Mode avion pendant la publication, puis réseau rétabli | Erreur claire, nouvelle tentative possible |
| O10 | Fermer l'app 10 min en arrière-plan, revenir | Données à jour |
| O11 | Quitter la room | Disparaît de « Mes rooms » |

### 5.3 Notifications et PWA

| ID | Scénario | Attendu |
| --- | --- | --- |
| N1 | iPhone, Safari non installé | Message « Ajoute à l'écran d'accueil » |
| N2 | iPhone installé : activer les notifications, A publie un mot | Notification reçue app fermée |
| N3 | Toucher la notification, app fermée puis app ouverte sur une autre room | Ouverture directe sur le bon mot |
| N4 | Couper les notifications d'une room | Plus rien de cette room, les autres continuent |
| N5 | Déployer une nouvelle version, rouvrir l'app installée | Nouvelle version active après au plus un rechargement |

### 5.4 Mise en page

320 px (iPhone SE), clavier ouvert sur chaque champ, mode paysage, texte agrandi (accessibilité iOS à 200 %), VoiceOver sur l'écran de devinette.

---

## 6. Diagnostic et suivi en production

1. **Page de diagnostic audio** `/#/debug` (à créer). Elle affiche le navigateur, l'état du contexte audio, le type de session iOS, la fréquence d'échantillonnage, les types MIME supportés et la permission micro. Elle propose un bip test, un enregistrement de 2 s avec écoute, et un bouton « Copier le rapport ». Un joueur qui rencontre un bug envoie ce rapport : on sait immédiatement dans quel cas on est.
2. **Remontée d'erreurs** (Sentry, offre gratuite), avec en contexte l'état du contexte audio, le type de session, l'écran courant et l'appareil. Une alerte se déclenche si un même message dépasse N occurrences par jour.
3. **Journal des pannes rattrapées.** Chaque fois qu'un filet de sécurité se déclenche (contexte recréé, fin de lecture forcée, décodage expiré), on envoie un événement. Si un filet se déclenche souvent sur un appareil, c'est un bug à investiguer même si le joueur ne l'a pas vu.
4. **Supabase** : logs des Edge Functions (`notify`, `cleanup`) et alerte si `cleanup` échoue. Suivi du stockage via `/admin`.

---

## 7. Checklist de mise en production

- [ ] CI verte : lint, unitaires, pannes audio, base de données, E2E (Chromium + WebKit + mobiles), visuels
- [ ] `supabase db reset` local OK, puis `npx supabase db push` en production
- [ ] Fonctions modifiées redéployées (`notify`, `cleanup`, `admin`)
- [ ] Nouvelles variables / secrets présents (Vercel et Supabase)
- [ ] Campagne manuelle §5.1 sur au moins un iPhone et un Android (A1, A2, A3, A10 au minimum)
- [ ] Après déploiement : `/admin` répond, un mot publié et deviné entre deux téléphones
- [ ] Pour chaque bug corrigé dans cette version : test de non-régression ajouté

---

## 8. Feuille de route

| Phase | Contenu | Effort estimé | Bénéfice |
| --- | --- | --- | --- |
| **1** | Vitest + faux AudioContext + injection de pannes (§4.1–4.3) ; scripts E2E existants versionnés dans `e2e/` avec Chromium + WebKit + mobiles (§4.6, backend simulé) ; CI GitHub Actions | 1–2 jours | Attrape la majorité des bugs audio / états bloqués avant le déploiement |
| **2** | Supabase local en CI : migrations depuis zéro, tests pgTAP d'accès et règles métier, tests Deno des fonctions, E2E multi-joueurs temps réel | 2 jours | Sécurité et temps réel garantis |
| **3** | Page `/#/debug`, Sentry et journal des pannes rattrapées | 1 jour | Diagnostic immédiat des bugs terrain |
| **4** | Appareils réels dans le cloud (nuit + avant release), tests visuels | 1 jour + abonnement | Couverture iOS réelle sans téléphone en main |
| Continu | Campagne manuelle §5 avant chaque release audio ; un test de non-régression par bug | 45 min / release | Ce que l'automatisation ne peut pas entendre |
