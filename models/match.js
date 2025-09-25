import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import Round from "./round.js";
import Tournament_player from "./tournament_player.js";

const Match = sequelize.define(
  "match",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    round_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    white_player_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    black_player_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    board_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    png: {
      type: DataTypes.STRING(),
    },
  },
  {
    freezeTableName: true,
    timestamps: true,
  }
);

Round.hasMany(Match, { foreignKey: "round_id" });
Match.belongsTo(Round, { foreignKey: "round_id" });

Tournament_player.hasMany(Match, { foreignKey: "white_player_id" });
Match.belongsTo(Tournament_player, { foreignKey: "white_player_id" });

Tournament_player.hasMany(Match, { foreignKey: "black_player_id" });
Match.belongsTo(Tournament_player, { foreignKey: "black_player_id" });

export default Match;
