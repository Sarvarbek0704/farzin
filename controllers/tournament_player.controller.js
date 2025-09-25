import { sendErrorResponse } from "../helpers/send.error.response.js";
import Tournament_player from "../models/tournament_player.js";

const CreateTournament_player = async (req, res) => {
  try {
    const { tournament_id, player_id, current_score, rank, is_active } = req.body;

    const newTournament_player = await Tournament_player.create({
      tournament_id,
      player_id,
      current_score,
      rank,
      is_active,
    });

    res.status(201).send({
      message: "New Tournament_player created successfully",
      data: newTournament_player,
    });
  } catch (err) {
    return sendErrorResponse(err, res, 500);
  }
};

const GetAllTournament_player = async (req, res) => {
  try {
    const Tournament_players = await Tournament_player.findAll();

    res.status(200).send({
      message: "Tournament_players find successfuly",
      data: Tournament_players,
    });
  } catch (err) {
    sendErrorResponse("Tournament_players find error", res, 500);
  }
};

const GetOneTournament_player = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament_player = await Tournament_player.findByPk(id);

    res.status(200).send({
      message: "Tournament_player fetched successfuly",
      data: tournament_player,
    });
  } catch (err) {
    sendErrorResponse("Tournament_player fetch error", res, 500);
  }
};

const UpdateTournament_player = async (req, res) => {
  try {
    const { tournament_id, player_id, current_score, rank, is_active } =
      req.body;
    const { id } = req.params;

    const tournament_player = await Tournament_player.update(
      {
        tournament_id,
      player_id,
      current_score,
      rank,
      is_active,
      },
      {
        where: { id },
        returning: true,
      }
    );

    res.status(200).send({
      message: "Tournament_player updated successfuly",
      data: tournament_player[1][0],
    });
  } catch (err) {
    sendErrorResponse("Tournament_player updated error", res, 500);
  }
};

const DeleteTournament_player = async (req, res) => {
  try {
    const { id } = req.params;

    const tournament_player = await Tournament_player.destroy({
      where: { id },
    });

    res.status(200).send({
      message: "Tournament_player deleted successfuly",
      data: tournament_player,
    });
  } catch (err) {
    sendErrorResponse("Tournament_player deleted error", res, 500);
  }
};

export {
  CreateTournament_player,
  GetAllTournament_player,
  GetOneTournament_player,
  UpdateTournament_player,
  DeleteTournament_player,
};
