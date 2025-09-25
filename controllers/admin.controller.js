import { sendErrorResponse } from "../helpers/send.error.response.js";
import Admin from "../models/admin.js";
import bcrypt from "bcrypt";

const CreateAdmin = async (req, res) => {
  try {
    const { full_name, password, phone_number, email, is_creater } = req.body;

    const candidate = await Admin.findOne({ where: { email } });
    if (candidate) {
      return sendErrorResponse({ message: "Email is unique" }, res, 403);
    }

    const hashedPass = await bcrypt.hash(password, 7);

    const newAdmin = await Admin.create({
      full_name,
      password: hashedPass,
      phone_number,
      email,
      is_creater,
    });

    res.status(201).send({
      message: "New Admin сreated",
      data: newAdmin,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllAdmin = async (req, res) => {
  try {
    const admins = await Admin.findAll();

    res.status(200).send({
      message: "Admins getted",
      data: admins,
    });
  } catch (err) {
    sendErrorResponse("Admins find error", res, 500);
  }
};

const GetOneAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findByPk(id);

    res.status(200).send({
      message: "Admin fetched successfuly",
      data: admin,
    });
  } catch (err) {
    sendErrorResponse("Admin fetch error", res, 500);
  }
};

const UpdateAdmin = async (req, res) => {
  try {
    const { full_name, password, phone_number, email, is_creater } = req.body;
    const { id } = req.params;

    const hashedPass = await bcrypt.hash(password, 7);

    const admin = await Admin.update(
      {
        full_name,
        password: hashedPass,
        phone_number,
        email,
        is_creater,
      },
      {
        where: { id },
        returning: true,
      }
    );

    res.status(200).send({
      message: "Admin updated successfuly",
      data: admin[1][0],
    });
  } catch (err) {
    sendErrorResponse("Admin updated error", res, 500);
  }
};

const DeleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.destroy({ where: { id } });

    res.status(200).send({
      message: "Admin deleted",
      data: admin,
    });
  } catch (err) {
    sendErrorResponse("Admin deleted error", res, 500);
  }
};

export { CreateAdmin, GetAllAdmin, GetOneAdmin, UpdateAdmin, DeleteAdmin };
