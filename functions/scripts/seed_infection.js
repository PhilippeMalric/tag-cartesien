import { createRoom, addPlayer, setRoles } from "./utils";
(async () => {
    const roomId = await createRoom({
        mode: "infection",
        victory: "all_infected",
        playersCount: 3
    });
    const A = "A-HUNTER", B = "B-PREY", C = "C-PREY";
    await addPlayer(roomId, A, "hunter", 0);
    await addPlayer(roomId, B, "prey", 0);
    await addPlayer(roomId, C, "prey", 0);
    await setRoles(roomId, { [A]: "hunter", [B]: "prey", [C]: "prey" });
    console.log("[seed:infection] room:", roomId, "A=chasseur, B/C=chassé, victory=all_infected");
})();
