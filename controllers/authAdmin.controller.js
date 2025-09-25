import { sendErrorResponse } from "../helpers/send.error.response.js";
import Admin from "../models/admin.js";
import bcrypt from "bcrypt";
import jwtService from "../services/jwt.service.js";
import config from "config";

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      return sendErrorResponse(
        {
          message: "Email yoki passworda noto'g'ri",
        },
        res,
        401
      );
    }

    const verifyPass = await bcrypt.compare(password, admin.password);

    if (!verifyPass) {
      return sendErrorResponse(
        {
          message: "Email yoki passworda noto'g'ri",
        },
        res,
        401
      );
    }

    let payload;
    if (admin.is_creater) {
      payload = {
        id: admin.id,
        email: admin.email,
        is_creator: admin.is_creator,
        role: "Superadmin",
      };
    } else {
      payload = {
        id: admin.id,
        email: admin.email,
        is_creator: admin.is_creator,
        role: "Admin",
      };
    }
    const tokens = jwtService.generateTokens(payload);

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 7);
    admin.refresh_token = hashedRefreshToken;

    await admin.save();
    res.cookie("refreshToken", tokens.refreshToken, {
      maxAge: config.get("cookie_refresh_token_time"),
      httpOnly: true,
    });

    res.status(200).send({
      message: "Admin logged in",
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    return sendErrorResponse(error, res, 500);
  }
};

const logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return sendErrorResponse(
        { message: "Cookie refresh token topilmadi" },
        res,
        400
      );
    }

    const verifiedRefreshToken = await jwtService.verifyRefreshToken(
      refreshToken
    );

    const admin = await Admin.findByPk(verifiedRefreshToken.id);
    admin.refresh_token = null;
    await admin.save();

    res.clearCookie("refreshToken");

    res.send({
      message: "Admin logged out",
    });
  } catch (error) {
    sendErrorResponse(error, res, 500);
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return sendErrorResponse(
        { message: "Cookie refresh token topilmadi" },
        res,
        400
      );
    }

    const verifiedRefreshToken = await jwtService.verifyRefreshToken(
      refreshToken
    );

    const admin = await Admin.findByPk(verifiedRefreshToken.id);
    const compare = await bcrypt.compare(refreshToken, admin.refresh_token);

    if (!compare) {
      return sendErrorResponse({ message: "Refresh token notogri" }, res, 400);
    }

    let payload;
    if (admin.is_creater) {
      payload = {
        id: admin.id,
        email: admin.email,
        is_creator: admin.is_creator,
        role: "Superadmin",
      };
    } else {
      payload = {
        id: admin.id,
        email: admin.email,
        is_creator: admin.is_creator,
        role: "Admin",
      };
    }
    const tokens = jwtService.generateTokens(payload);

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 7);
    admin.refresh_token = hashedRefreshToken;

    await admin.save();

    res.cookie("refreshToken", tokens.refreshToken, {
      maxAge: config.get("cookie_refresh_token_time"),
      httpOnly: true,
    });

    res.status(200).send({
      message: "Admin token refreshed",
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    sendErrorResponse(error, res, 500);
  }
};

export { login, logout, refreshToken };
