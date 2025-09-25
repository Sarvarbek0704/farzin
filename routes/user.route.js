import { Router } from "express";
import {
  GetOneUser,
  CreateUser,
  GetAllUser,
  UpdateUser,
  DeleteUser,
} from "../controllers/user.controller.js";

const router = Router();

router.post("/", CreateUser);
router.get("/", GetAllUser);
router.get("/:id", GetOneUser);
router.patch("/:id", UpdateUser);
router.delete("/:id", DeleteUser);

export default router;
