import { createRoom, addPlayer, setRoles } from "./utils";
(async () => {
    const roomId = await createRoom({ mode: "classic", targetScore: 3 });
    const A = "A-HUNTER", B = "B-PREY";
    await addPlayer(roomId, A, "hunter", 0);
    await addPlayer(roomId, B, "prey", 0);
    await setRoles(roomId, { [A]: "hunter", [B]: "prey" });
    console.log("[seed:classic] room:", roomId, "A=chasseur, B=chassé, targetScore=3");
})();
