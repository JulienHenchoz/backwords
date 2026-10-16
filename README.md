# Backwords

Party game audio : enregistre un mot, écoute-le à l'envers, devine-le.

- **Partie locale** : on se passe le téléphone de main en main.
- **Partie en ligne** : rooms à code à 6 chiffres, chacun joue sur son téléphone, notifications push à chaque nouveau mot. Mise en place du backend : [docs/ONLINE.md](docs/ONLINE.md).

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

Stack : React 19 + Vite (PWA), Supabase pour le mode en ligne (`supabase/`).
