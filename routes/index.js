import { Router } from "express";
import AdminRouter from "./admin.route.js";
import Chess_typeRouter from "./chess_type.route.js";
import PlayerRouter from "./player.route.js";
import TournamentRouter from "./tournament.route.js";
import TournamentPlayerRouter from "./tournament_player.route.js";
import RoundRouter from "./round.route.js";
import MatchRouter from "./match.route.js";
// import authGuard from "../middlewares/guards/auth.guard.js";
// import roleGuard from "../middlewares/guards/role.guard.js";

const router = Router();

router.use("/admin", AdminRouter);
router.use("/chess_type", Chess_typeRouter);
router.use("/player", PlayerRouter);
router.use("/tournament", TournamentRouter);
router.use("/tournament_player", TournamentPlayerRouter);
router.use("/round", RoundRouter);
router.use("/match", MatchRouter);

// router.use(authGuard);   // PASTGA BOSHQA ROUTLAR KELADI KEEN

export default router;
