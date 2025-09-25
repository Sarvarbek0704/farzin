import { sendErrorResponse } from "../helpers/send.error.response.js";
import Chess_type from "../models/chess_type.js";
import bcrypt from "bcrypt";

const CreateChess_type = async (req, res) => {
  try {
    const { category, base_time_minutes, increment_seconds, description } =
      req.body;

    const newChess_type = await Chess_type.create({
      category,
      base_time_minutes,
      increment_seconds,
      description,
    });

    res.status(201).send({
      message: "New Chess_type сreated successfuly",
      data: newChess_type,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllChess_type = async (req, res) => {
  try {
    const Chess_types = await Chess_type.findAll();

    res.status(200).send({
      message: "Chess_types find successfuly",
      data: Chess_types,
    });
  } catch (err) {
    sendErrorResponse("Chess_types find error", res, 500);
  }
};

const GetOneChess_type = async (req, res) => {
  try {
    const { id } = req.params;

    const chess_type = await Chess_type.findByPk(id);

    res.status(200).send({
      message: "Chess_type fetched successfuly",
      data: chess_type,
    });
  } catch (err) {
    sendErrorResponse("Chess_type fetch error", res, 500);
  }
};

const UpdateChess_type = async (req, res) => {
  try {
    const { category, base_time_minutes, increment_seconds, description } =
      req.body;
    const { id } = req.params;

    const chess_type = await Chess_type.update(
      {
        category,
        base_time_minutes,
        increment_seconds,
        description,
      },
      {
        where: { id },
        returning: true,
      }
    );

    res.status(200).send({
      message: "Chess_type updated successfuly",
      data: chess_type[1][0],
    });
  } catch (err) {
    sendErrorResponse("Chess_type updated error", res, 500);
  }
};

const DeleteChess_type = async (req, res) => {
  try {
    const { id } = req.params;

    const chess_type = await Chess_type.destroy({ where: { id } });

    res.status(200).send({
      message: "Chess_type deleted successfuly",
      data: chess_type,
    });
  } catch (err) {
    sendErrorResponse("Chess_type deleted error", res, 500);
  }
};

export {
  CreateChess_type,
  GetAllChess_type,
  GetOneChess_type,
  UpdateChess_type,
  DeleteChess_type,
};
