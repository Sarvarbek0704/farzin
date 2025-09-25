import { Router } from "express";
import {
  CreateRound,
  GetAllRound,
  GetOneRound,
  UpdateRound,
  DeleteRound,
} from "../controllers/round.controller.js";

const router = Router();

router.post("/", CreateRound);
router.get("/", GetAllRound);
router.get("/:id", GetOneRound);
router.patch("/:id", UpdateRound);
router.delete("/:id", DeleteRound);

export default router;
