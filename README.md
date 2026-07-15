# Clone War

Prototype jouable de RTS/tycoon en Three.js. Développez une usine à clones, reliez les extracteurs au stockage avec des convoyeurs, capturez les régions organiques et détruisez le noyau de l’IA.

Clone War est entièrement statique : aucune base de données ni API n’est requise. Les paramètres et statistiques sont conservés localement dans le navigateur, et la simulation tourne dans un Web Worker.

Les cartes comportent maintenant un canal nutritif généré depuis la seed. L’eau bloque les clones terrestres : capturez une rive, installez une **Pompe osmotique**, acheminez l’eau au stockage, puis construisez un **Port synaptique**. Les esciffes, péniches et barges embarquent une sélection de clones avant de les débarquer sur une autre terre.

Deux ports actifs construits sur des terres séparées ouvrent automatiquement une route maritime. Des navires d’échange parcourent le canal et apportent des matériaux aux deux destinations : les routes longues sont les plus rentables.

## Lancer le jeu

```bash
npm install
npm run dev
```

Puis ouvrir l’URL affichée par Vite. Le jeu est conçu pour ordinateur, avec souris et clavier.

## GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie automatiquement la branche `main` sur GitHub Pages. Dans les réglages du dépôt, ouvrez **Settings → Pages** puis sélectionnez **GitHub Actions** comme source de déploiement. Après le premier push, le jeu sera disponible à l’adresse :

`https://<compte-github>.github.io/<nom-du-repo>/`

Le chemin de déploiement est détecté automatiquement depuis `GITHUB_REPOSITORY`, donc il fonctionne même si le dépôt est renommé.

Depuis l’accueil, le bouton **Paramètres** ouvre le panneau de configuration local. Les réglages sont conservés dans le navigateur : qualité de rendu (éco, standard, haute), ombres, animations réduites, contraste, audio, vitesse de caméra et remappage des touches. La qualité choisie est appliquée au démarrage de la prochaine partie.

## Contrôles

- Clic gauche / rectangle : sélectionner une structure ou des clones
- Clic droit : déplacer la sélection
- Maj + clic droit : attaque-mouvement
- WASD ou flèches : déplacer la caméra
- Molette : zoomer
- Q / E : tourner la caméra
- Ctrl + 1…9 : enregistrer un groupe ; 1…9 : rappeler le groupe
- B, O, C, G, X, V, R, T, L, F : raccourcis de construction
- P ou Espace : pause
- Échap : annuler le mode de construction

Pour une traversée : sélectionnez une coque prête, sélectionnez ensuite les clones à proximité, utilisez **Embarquer**, puis clic droit sur une terre cible. Les navires ont des capacités, vitesses et résistances différentes.

Les commandes de caméra, de rotation, de pause, d’annulation et le modificateur d’attaque peuvent être personnalisées depuis ce panneau.

## Architecture

- `src/game` : simulation déterministe à 20 Hz, génération de carte, IA et contrats sérialisables
- `src/engine` : rendu Three.js, instancing, caméra et contrôles RTS
- `src/components` : menus et HUD React, mis à jour à fréquence limitée
- `src/game/game.worker.ts` : simulation isolée du thread de rendu

## Validation

```bash
npm test
npm run build
```

Le projet est une création originale. Aucun code ni asset d’OpenFront n’est inclus.
