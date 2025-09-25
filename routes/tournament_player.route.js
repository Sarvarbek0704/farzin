import { Router } from "express";
import {
  CreateTournament_player,
  GetAllTournament_player,
  GetOneTournament_player,
  UpdateTournament_player,
  DeleteTournament_player,
} from "../controllers/tournament_player.controller.js";

const router = Router();

router.post("/", CreateTournament_player);
router.get("/", GetAllTournament_player);
router.get("/:id", GetOneTournament_player);
router.patch("/:id", UpdateTournament_player);
router.delete("/:id", DeleteTournament_player);

export default router;
