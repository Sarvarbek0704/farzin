import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import Tournament from "./tournament.js";
import Player from "./player.js";

const Tournament_player = sequelize.define(
  "tournament_player",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    tournament_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    player_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    current_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rank: {
      type: DataTypes.INTEGER,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

Tournament_player.belongsTo(Tournament, { foreignKey: "tournament_id" });
Tournament.hasMany(Tournament_player, { foreignKey: "tournament_id" });

Tournament_player.belongsTo(Player, { foreignKey: "player_id" });
Player.hasMany(Tournament_player, { foreignKey: "player_id" });

export default Tournament_player;
