import { Router } from "express";
import {
  CreateMatch,
  GetAllMatch,
  GetOneMatch,
  UpdateMatch,
  DeleteMatch,
} from "../controllers/match.controller.js";

const router = Router();

router.post("/", CreateMatch);
router.get("/", GetAllMatch);
router.get("/:id", GetOneMatch);
router.patch("/:id", UpdateMatch);
router.delete("/:id", DeleteMatch);

export default router;
