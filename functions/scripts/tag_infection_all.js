import { emitTag, sleep } from "./utils";
const DELAY = 1300; // > iFrame 1200/1500ms selon ta conf
(async () => {
    const roomId = process.argv[2]; // passe l'ID en argument
    const A = "A-HUNTER", B = "B-PREY", C = "C-PREY";
    if (!roomId) {
        console.error("Usage: npm run tag:infection -- <ROOM_ID>");
        process.exit(1);
    }
    console.log("[infection] A → B");
    await emitTag(roomId, A, B);
    await sleep(DELAY);
    console.log("[infection] B → C (B est devenu chasseur)");
    await emitTag(roomId, "B-PREY", C);
    await sleep(DELAY);
    console.log("[infection] Vérifie rooms/<id>.state == ended (all_infected)");
})();
