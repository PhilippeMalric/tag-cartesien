import { createRoom, addPlayer, setRoles } from "./utils";

(async () => {
  const roomId = await createRoom({
    mode: "infection",
    victory: "all_infected",
    playersCount: 3
  });
  const A = "A-HUNTER", B = "B-PREY", C = "C-PREY";
  await addPlayer(roomId, A, "chasseur", 0);
  await addPlayer(roomId, B, "chassé", 0);
  await addPlayer(roomId, C, "chassé", 0);
  await setRoles(roomId, { [A]: "chasseur", [B]: "chassé", [C]: "chassé" });
  console.log("[seed:infection] room:", roomId, "A=chasseur, B/C=chassé, victory=all_infected");
})();
