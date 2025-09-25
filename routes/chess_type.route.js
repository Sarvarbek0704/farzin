import { Router } from "express";
import {
  GetOneChess_type,
  CreateChess_type,
  GetAllChess_type,
  UpdateChess_type,
  DeleteChess_type,
} from "../controllers/chess_type.controller.js";

const router = Router();

router.post("/", CreateChess_type);
router.get("/", GetAllChess_type);
router.get("/:id", GetOneChess_type);
router.patch("/:id", UpdateChess_type);
router.delete("/:id", DeleteChess_type);

export default router;
