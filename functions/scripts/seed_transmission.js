import { createRoom, addPlayer, setRoles } from "./utils";
(async () => {
    const roomId = await createRoom({ mode: "transmission" });
    const A = "A-HUNTER", B = "B-PREY";
    await addPlayer(roomId, A, "chasseur", 0);
    await addPlayer(roomId, B, "chassé", 0);
    await setRoles(roomId, { [A]: "chasseur", [B]: "chassé" });
    console.log("[seed:transmission] room:", roomId, "A=chasseur, B=chassé");
})();
