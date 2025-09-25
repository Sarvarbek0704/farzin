import { Router } from "express";
import {
  GetOnePlayer,
  CreatePlayer,
  GetAllPlayer,
  UpdatePlayer,
  DeletePlayer,
} from "../controllers/player.controller.js";

const router = Router();

router.post("/", CreatePlayer);
router.get("/", GetAllPlayer);
router.get("/:id", GetOnePlayer);
router.patch("/:id", UpdatePlayer);
router.delete("/:id", DeletePlayer);

export default router;
