import { sendErrorResponse } from "../../helpers/send.error.response.js";

const roleGuard = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || typeof req.user.role === "undefined") {
      return sendErrorResponse(
        { message: "Foydalanuvchi aniqlanmadi yoki roli yo'q" },
        res,
        401
      );
    }
    if (!roles.includes(req.user.role)) {
      console.log(req.user);

      return sendErrorResponse({ message: "Sizga ruxsat yo'q" }, res, 403);
    }
    next();
  };
};

export default roleGuard;
