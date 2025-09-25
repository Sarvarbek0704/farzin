import { sendErrorResponse } from "../helpers/send.error.response.js";
import Tournament from "../models/tournament.js";
import bcrypt from "bcrypt";

const CreateTournament = async (req, res) => {
  try {
    const {
      name,
      type_id,
      address,
      location,
      start_date,
      end_date,
      status,
      round,
    } = req.body;
    const newTournament = await Tournament.create({
      name,
      type_id,
      address,
      location,
      start_date,
      end_date,
      status,
      round,
    });

    res.status(201).send({
      message: "New Tournament сreated successfuly",
      data: newTournament,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllTournament = async (req, res) => {
  try {
    const Tournaments = await Tournament.findAll();

    res.status(200).send({
      message: "Tournaments find successfuly",
      data: Tournaments,
    });
  } catch (err) {
    sendErrorResponse("Tournaments find error", res, 500);
  }
};

const GetOneTournament = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await Tournament.findByPk(id);

    res.status(200).send({
      message: "Tournament fetched successfuly",
      data: tournament,
    });
  } catch (err) {
    sendErrorResponse("Tournament fetch error", res, 500);
  }
};

const UpdateTournament = async (req, res) => {
  try {
    const {
      name,
      type_id,
      address,
      location,
      start_date,
      end_date,
      status,
      round,
    } = req.body;
    const { id } = req.params;

    const tournament = await Tournament.update(
      {
        name,
        type_id,
        address,
        location,
        start_date,
        end_date,
        status,
        round,
      },
      {
        where: { id },
        returning: true,
      }
    );

    res.status(200).send({
      message: "Tournament updated successfuly",
      data: tournament[1][0],
    });
  } catch (err) {
    sendErrorResponse("Tournament updated error", res, 500);
  }
};

const DeleteTournament = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await Tournament.destroy({ where: { id } });

    res.status(200).send({
      message: "Tournament deleted successfuly",
      data: tournament,
    });
  } catch (err) {
    sendErrorResponse("Tournament deleted error", res, 500);
  }
};

export {
  CreateTournament,
  GetAllTournament,
  GetOneTournament,
  UpdateTournament,
  DeleteTournament,
};
