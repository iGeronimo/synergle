import { initArchive } from "./archive";
import { initCommon } from "./common";
import { initGame } from "./game/controller";

initCommon();

const game = document.getElementById("game");
if (game) {
  initGame(game).catch((err) => {
    console.error(err);
  });
}

const archive = document.getElementById("archive");
if (archive) initArchive(archive);
