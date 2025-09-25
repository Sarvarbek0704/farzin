import Match from "../models/match.js";
import { sendErrorResponse } from "../helpers/send.error.response.js";

const CreateMatch = async (req, res) => {
  try {
    const {
      round_id,
      white_player_id,
      black_player_id,
      result,
      board_number,
      start_time,
      end_time,
      png,
    } = req.body;
    const newMatch = await Match.create({
      round_id,
      white_player_id,
      black_player_id,
      result,
      board_number,
      start_time,
      end_time,
      png,
    });
    res.status(201).send({
      message: "New Match created successfully",
      data: newMatch,
    });
  } catch (err) {
    sendErrorResponse(err, res, 500);
  }
};

const GetAllMatch = async (req, res) => {
  try {
    const matches = await Match.findAll();
    res.status(200).send({
      message: "Matches find successfuly",
      data: matches,
    });
  } catch (err) {
    sendErrorResponse(err, res, 500);
  }
};

const GetOneMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findByPk(id);
    res.status(200).send({
      message: "Match fetched successfuly",
      data: match,
    });
  } catch (err) {
    sendErrorResponse(err, res, 500);
  }
};

const UpdateMatch = async (req, res) => {
  try {
    const {
      round_id,
      white_player_id,
      black_player_id,
      result,
      board_number,
      start_time,
      end_time,
      png,
    } = req.body;
    const { id } = req.params;
    const match = await Match.update(
      {
        round_id,
        white_player_id,
        black_player_id,
        result,
        board_number,
        start_time,
        end_time,
        png,
      },
      {
        where: { id },
        returning: true,
      }
    );
    res.status(200).send({
      message: "Match updated successfuly",
      data: match[1][0],
    });
  } catch (err) {
    sendErrorResponse(err, res, 500);
  }
};

const DeleteMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.destroy({ where: { id } });
    res.status(200).send({
      message: "Match deleted successfuly",
      data: match,
    });
  } catch (err) {
    sendErrorResponse(err, res, 500);
  }
};

export { CreateMatch, GetAllMatch, GetOneMatch, UpdateMatch, DeleteMatch };
