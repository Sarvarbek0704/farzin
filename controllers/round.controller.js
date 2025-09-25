import { sendErrorResponse } from "../helpers/send.error.response.js";
import Round from "../models/round.js";

const CreateRound = async (req, res) => {
  try {
    const { tournament_id, round_number, status, start_time, end_time } =
      req.body;

    const newRound = await Round.create({
      tournament_id,
      round_number,
      status,
      start_time,
      end_time,
    });

    res.status(201).send({
      message: "New Round created successfully",
      data: newRound,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllRound = async (req, res) => {
  try {
    const rounds = await Round.findAll();
    res.status(200).send({
      message: "Rounds find successfuly",
      data: rounds,
    });
  } catch (err) {
    sendErrorResponse({ message: "Rounds find error" }, res, 500);
  }
};

const GetOneRound = async (req, res) => {
  try {
    const { id } = req.params;
    const round = await Round.findByPk(id);
    
    res.status(200).send({
      message: "Round fetched successfuly",
      data: round,
    });
  } catch (err) {
    sendErrorResponse({ message: "Round fetch error" }, res, 500);
  }
};

const UpdateRound = async (req, res) => {
  try {
    const { tournament_id, round_number, status, start_time, end_time } =
      req.body;
    const { id } = req.params;
    const round = await Round.update(
      {
        tournament_id,
        round_number,
        status,
        start_time,
        end_time,
      },
      {
        where: { id },
        returning: true,
      }
    );
    
    res.status(200).send({
      message: "Round updated successfuly",
      data: round[1][0],
    });
  } catch (err) {
    sendErrorResponse({ message: "Round updated error" }, res, 500);
  }
};

const DeleteRound = async (req, res) => {
  try {
    const { id } = req.params;

    const round = await Round.destroy({ where: { id } });

    res.status(200).send({
      message: "Round deleted successfuly",
      data: round,
    });
  } catch (err) {
    sendErrorResponse({ message: "Round deleted error" }, res, 500);
  }
};

export { CreateRound, GetAllRound, GetOneRound, UpdateRound, DeleteRound };
