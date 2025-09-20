import { emitTag, sleep } from "./utils";
const DELAY = 1400; // > cooldown serveur 1200ms
(async () => {
    const roomId = process.argv[2]; // passe l'ID en argument
    const A = "A-HUNTER", B = "B-PREY";
    if (!roomId) {
        console.error("Usage: npm run tag:classic -- <ROOM_ID>");
        process.exit(1);
    }
    console.log("[classic] 1/3");
    await emitTag(roomId, A, B);
    await sleep(DELAY);
    console.log("[classic] 2/3");
    await emitTag(roomId, A, B);
    await sleep(DELAY);
    console.log("[classic] 3/3 → devrait terminer la room");
    await emitTag(roomId, A, B);
    console.log("[classic] done. Vérifie Firestore: rooms/<id>/players/A-HUNTER.score >= 3 et rooms/<id>.state == ended");
})();
