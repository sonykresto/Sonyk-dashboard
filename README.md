# Sonyk — Tableau de bord

Dashboard React connecté en direct au Google Sheet de Batbout++.

## Tester en local (optionnel, avant de déployer)

```
npm install
npm run dev
```

Ouvre l'adresse affichée (généralement http://localhost:5173) dans ton navigateur.

## Déployer sur Vercel — méthode la plus simple

**Option A — sans GitHub, avec la CLI Vercel (le plus rapide)**

1. Installe la CLI Vercel une seule fois :
   ```
   npm install -g vercel
   ```
2. Dans ce dossier, lance :
   ```
   vercel
   ```
3. Suis les questions à l'écran (connecte-toi avec ton compte Vercel — tu peux en créer un gratuitement avec ton email ou ton compte Google/GitHub). Accepte les valeurs par défaut proposées.
4. À la fin, Vercel te donne une URL publique (ex: `sonyk-dashboard.vercel.app`) — c'est le lien final, accessible depuis n'importe quel appareil, y compris ton téléphone.
5. Pour publier une mise à jour plus tard, relance simplement `vercel --prod` depuis ce dossier après avoir modifié le code.

**Option B — avec GitHub (mieux si tu veux itérer souvent)**

1. Crée un nouveau repo GitHub (ex: `sonyk-dashboard`), pousse ce dossier dedans.
2. Va sur vercel.com → "Add New Project" → connecte ton compte GitHub → sélectionne le repo.
3. Vercel détecte automatiquement Vite, laisse les réglages par défaut, clique "Deploy".
4. Chaque fois que tu pousses du code sur GitHub, Vercel redéploie automatiquement.

## Un restaurant = un fichier ?

Pour l'instant, `SPREADSHEET_ID` et `RESTAURANT_LABEL` sont codés en dur en haut de `src/App.jsx` (actuellement réglés sur Batbout++). Pour un autre restaurant, il faut soit dupliquer le projet, soit — mieux, à prévoir plus tard — passer ces valeurs via l'URL (ex: `?resto=batbout`) pour n'avoir qu'un seul déploiement qui dessert tous les clients.
