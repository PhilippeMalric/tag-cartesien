import { createRoom, addPlayer, setRoles } from "./utils";
(async () => {
    const roomId = await createRoom({ mode: "classic", targetScore: 3 });
    const A = "A-HUNTER", B = "B-PREY";
    await addPlayer(roomId, A, "chasseur", 0);
    await addPlayer(roomId, B, "chassé", 0);
    await setRoles(roomId, { [A]: "chasseur", [B]: "chassé" });
    console.log("[seed:classic] room:", roomId, "A=chasseur, B=chassé, targetScore=3");
})();
