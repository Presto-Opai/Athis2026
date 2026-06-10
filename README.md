# Athis 2026 🥬🧟

Une maison normande et son jardin, reconstitués mètre par mètre d'après une vidéo
d'hiver — puis transformés en terrain de jeu.

**👉 Jouer : [presto-opai.github.io/Athis2026](https://presto-opai.github.io/Athis2026/)**

| Quoi | Où |
|---|---|
| 🥬 **Navet Panique !** — FPS dans le jardin, zombies vs navets, clavier **et** mobile | [`NavetPanique/`](NavetPanique/) |
| 🗺️ **Plan de la maison & du jardin** — style carte ancienne (SVG) | [`plan-maison-jardin.svg`](plan-maison-jardin.svg) |
| ✏️ **Éditeur de plan** — corriger le plan et exporter `plan.json` | [`editeur-plan.html`](editeur-plan.html) |
| 📐 **`plan.json`** — la source de vérité du terrain (mètres, x : O→E, z : N→S) | [`NavetPanique/plan.json`](NavetPanique/plan.json) |

## Le pipeline

1. Une vidéo de la maison et du jardin, découpée en frames *(non publiées)* ;
2. un plan reconstitué, corrigé à la main dans **l'éditeur** → `plan.json` ;
3. le jeu construit son monde 3D depuis ce plan : la longère de 30 m, la cour pavée,
   la porte blanche (fermée, évidemment), le grand thuya, le potager-armurerie.

## Technique

Three.js r147 (embarqué, zéro dépendance en ligne), tout est procédural : textures
peintes en canvas, sons synthétisés WebAudio, coucher de soleil ACES + bloom,
~9 000 touffes d'herbe instanciées. Fonctionne en ouvrant `index.html`, même hors-ligne.

---
*Construit avec [Claude Code](https://claude.com/claude-code) — juin 2026.*
