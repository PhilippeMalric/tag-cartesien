# Tag cartésien

Application **Angular** multi-joueurs de jeu de tag (chat) sur un **plan cartésien**.  
Les joueurs rejoignent une *room*, se positionnent avec des coordonnées **(x, y)**, et un **chasseur** tente de toucher les autres selon un **mode de jeu**.

---

## ✨ Fonctionnalités

- **Lobby & Rooms** : lister, créer et rejoindre des rooms, voir le nombre de joueurs.
- **Rôles** : chasseur vs. coureurs ; attribution et changement de rôle selon le mode.
- **Modes de jeu** :
  - `classic` : le chasseur reste chasseur jusqu’à la fin.
  - `infection` : un joueur touché rejoint l’équipe des chasseurs.
  - `transmission` *(optionnel / en chantier)* : la victime devient chasseur.
- **Carte cartésienne** : composant *MapPicker* (canvas) pour placer/lire **(x, y)**.
- **Événements de tag** : émission/écoute d’événements en temps réel.
- **Temps réel & sécurité** : persistance et synchro via Firebase (Firestore / RTDB).

---

## 🧱 Architecture (haut niveau)

- **Angular 20+** (standalone, signals, `@if/@for`).
- **Angular Material** pour l’UI (listes, menus, chips, tooltips, badges…).
- **Firebase** : Auth (anonyme possible), Firestore, (optionnel RTDB), Hosting, Cloud Functions.
- **Services** front :
  - `RoomService` : CRUD room/joueurs, états de partie.
  - `MatchService` : logique d’émission d’événements (ex. *tag*), cool-downs.
  - `LobbyFacade / RoomFacade` : orchestration UI (selon refactor).

---

## 🗂 Schéma de données (résumé)
Voir « Diagramme minimal des collections » plus bas.

Collections principales :
- `rooms/{roomId}` : doc de salle (mode, owner, état, `hunterUid`, etc.)
- `rooms/{roomId}/players/{uid}` : joueur (pseudo, coord., rôle…)
- `rooms/{roomId}/events/{eventId}` *(optionnel)* : événements (ex. tag)

---

## 🚀 Démarrage

### Prérequis
- Node LTS, Angular CLI, Firebase CLI
- Projet Firebase configuré (Firestore en mode production recommandé)

### Installation
```bash
npm ci