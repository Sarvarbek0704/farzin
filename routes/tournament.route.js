import { Router } from "express";
import {
  GetOneTournament,
  CreateTournament,
  GetAllTournament,
  UpdateTournament,
  DeleteTournament,
} from "../controllers/tournament.controller.js";

const router = Router();

router.post("/", CreateTournament);
router.get("/", GetAllTournament);
router.get("/:id", GetOneTournament);
router.patch("/:id", UpdateTournament);
router.delete("/:id", DeleteTournament);

export default router;
