import { Router } from "express";
import {
  GetOneAdmin,
  CreateAdmin,
  GetAllAdmin,
  UpdateAdmin,
  DeleteAdmin,
} from "../controllers/admin.controller.js";

import {
  login,
  logout,
  refreshToken,
} from "../controllers/authAdmin.controller.js";

import authGuard from "../middlewares/guards/auth.guard.js";
import roleGuard from "../middlewares/guards/role.guard.js";
import selfGuard from "../middlewares/guards/self.guard.js";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refreshToken);

router.use(authGuard);

router.post("/", CreateAdmin);
router.get("/", roleGuard(["Superadmin"]), GetAllAdmin);
router.get("/:id", roleGuard(["Superadmin", "Admin"]), selfGuard, GetOneAdmin);
router.patch(
  "/:id",
  roleGuard(["Superadmin", "Admin"]),
  selfGuard,
  UpdateAdmin
);
router.delete("/:id", roleGuard(["Superadmin"]), DeleteAdmin);

export default router;
