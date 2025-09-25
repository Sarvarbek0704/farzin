import jwtService from "../../services/jwt.service.js";
import { sendErrorResponse } from "../../helpers/send.error.response.js";

const authGuard = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendErrorResponse({ message: "Token topilmadi" }, res, 401);
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwtService.verifyAccessToken(token);

    req.user = payload;
    next();
  } catch (error) {
    return sendErrorResponse({ message: "Token yaroqsiz" }, res, 401);
  }
};

export default authGuard;
