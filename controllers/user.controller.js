import { sendErrorResponse } from "../helpers/send.error.response.js";
import User from "../models/user.js";
import bcrypt from "bcrypt";

const CreateUser = async (req, res) => {
  try {
    const { full_name, username, password, phone_number, email } = req.body;

    const candidate = await User.findOne({ where: { email } });
    if (candidate) {
      return sendErrorResponse({ message: "Email is unique" }, res, 403);
    }

    const hashedPass = await bcrypt.hash(password, 7);

    const newUser = await User.create({
      full_name,
      username,
      password,
      phone_number,
      email,
    });

    res.status(201).send({
      message: "New User сreated successfuly",
      data: newUser,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllUser = async (req, res) => {
  try {
    const Users = await User.findAll();

    res.status(200).send({
      message: "Users find successfuly",
      data: Users,
    });
  } catch (err) {
    sendErrorResponse("Users find error", res, 500);
  }
};

const GetOneUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);

    res.status(200).send({
      message: "User fetched successfuly",
      data: user,
    });
  } catch (err) {
    sendErrorResponse("User fetch error", res, 500);
  }
};

const UpdateUser = async (req, res) => {
  try {
    const { full_name, username, password, phone_number, email } = req.body;
    const { id } = req.params;

    const hashedPass = await bcrypt.hash(password, 7);

    const user = await User.update(
      {
        full_name,
        username,
        password,
        phone_number,
        email,
      },
      {
        where: { id },
        returning: true,
      }
    );

    res.status(200).send({
      message: "User updated successfuly",
      data: user[1][0],
    });
  } catch (err) {
    sendErrorResponse("User updated error", res, 500);
  }
};

const DeleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.destroy({ where: { id } });

    res.status(200).send({
      message: "User deleted successfuly",
      data: user,
    });
  } catch (err) {
    sendErrorResponse("User deleted error", res, 500);
  }
};

export { CreateUser, GetAllUser, GetOneUser, UpdateUser, DeleteUser };
