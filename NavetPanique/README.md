# 🥬 Navet Panique !

Un FPS de jardin normand : des zombies ont trouvé le portail du **92**, et tu les
accueilles à coups de navets. Le terrain de jeu est construit depuis **`plan.json`**
(le plan corrigé par l'auteur dans `../editeur-plan.html`) : la longère de 30 m,
la cour pavée devant, le grand thuya central, les deux tas de bois, l'étendoir en
diagonale… Voir aussi `../plan-maison-jardin.svg`.

## Jouer

Double-clique sur **`index.html`** — c'est tout. Aucune installation, aucun serveur,
ça marche même hors-ligne (Three.js est embarqué dans le dossier).

## Commandes (clavier AZERTY géré nativement)

| Touche | Action |
|---|---|
| **Z Q S D** (ou flèches) | se déplacer |
| **Souris** | viser |
| **Clic gauche** ou **Espace** | lancer un navet — *maintenir pour lancer plus fort* |
| **Maj** | courir |
| **E** | ramasser un navet (dans le potager) |
| **Échap** | pause |

## Règles du potager

- 15 navets maximum dans les poches ; recharge en marchant dans le **potager**
  (au fond à gauche du jardin, là où il a toujours été).
- Zombie touché : +2 pts. Composté : +10 pts. **En pleine tête : +15 pts.**
- Vague nettoyée : +25 pts et quelques secondes de répit.
- Les zombies entrent par **le portail**, **le chemin** à l'est et **le trou de la haie**
  au nord — surveille la minimap (calquée sur le plan).

## Le monde

Tout y est : la maison principale et la dépendance reliées par le mur en pierres et
sa **porte blanche (fermée, évidemment)**, la cour pavée et sa table verte, l'appentis
à vélos, le grand thuya, les bosquets sur murets, l'étendoir à linge, les hortensias
séchés, le tas de bois vert, la boîte aux lettres verte du 92… et la fumée de la
cheminée, parce qu'il fait froid dehors.

## Sous le capot

Rendu « coucher de soleil d'hiver » : tone mapping cinéma (ACES), matériaux à relief
(pierre, tuiles, pavés), grand soleil couchant posé sur le toit de la longère,
fenêtres allumées, terrain vallonné, ~9 000 touffes d'herbe, bloom et antialiasing
en post-traitement.
Tout est procédural (zéro image téléchargée) ; Three.js r147 est embarqué dans `vendor/`.

Pour corriger le plan du terrain : ouvre **`../editeur-plan.html`**, modifie, exporte
`plan.json` dans le dossier du projet, et demande à Claude de mettre à jour le jeu.

*Reconstitué avec affection par Fable — juin 2026.*
