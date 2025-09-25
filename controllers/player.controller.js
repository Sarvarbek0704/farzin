import { sendErrorResponse } from "../helpers/send.error.response.js";
import Player from "../models/player.js";
import bcrypt from "bcrypt";

const CreatePlayer = async (req, res) => {
  try {
    const { full_name, username, email, rating, country, age } = req.body;

    const candidate = await Player.findOne({ where: { email } });
    if (candidate) {
      return sendErrorResponse({ message: "Email is unique" }, res, 403);
    }

    const newPlayer = await Player.create({
      full_name,
      username,
      email,
      rating,
      country,
      age,
    });

    res.status(201).send({
      message: "New Player сreated successfuly",
      data: newPlayer,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllPlayer = async (req, res) => {
  try {
    const Players = await Player.findAll();

    res.status(200).send({
      message: "Players find successfuly",
      data: Players,
    });
  } catch (err) {
    sendErrorResponse({ message: "Players find error" }, res, 500);
  }
};

const GetOnePlayer = async (req, res) => {
  try {
    const { id } = req.params;

    const player = await Player.findByPk(id);

    res.status(200).send({
      message: "Player fetched successfuly",
      data: player,
    });
  } catch (err) {
    sendErrorResponse({ message: "Player fetch error" }, res, 500);
  }
};

const UpdatePlayer = async (req, res) => {
  try {
    const { full_name, username, email, rating, country, age } = req.body;
    const { id } = req.params;

    const hashedPass = await bcrypt.hash(password, 7);

    const player = await Player.update(
      {
        full_name,
        username,
        email,
        rating,
        country,
        age,
      },
      {
        where: { id },
        returning: true,
      }
    );

    res.status(200).send({
      message: "Player updated successfuly",
      data: player[1][0],
    });
  } catch (err) {
    sendErrorResponse({ message: "Player updated error" }, res, 500);
  }
};

const DeletePlayer = async (req, res) => {
  try {
    const { id } = req.params;

    const player = await Player.destroy({ where: { id } });

    res.status(200).send({
      message: "Player deleted successfuly",
      data: player,
    });
  } catch (err) {
    sendErrorResponse({ message: "Player deleted error" }, res, 500);
  }
};

export { CreatePlayer, GetAllPlayer, GetOnePlayer, UpdatePlayer, DeletePlayer };
