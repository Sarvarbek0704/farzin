import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import Tournament from "./tournament.js";

const Round = sequelize.define(
  "round",
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
    round_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
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
  },
  {
    freezeTableName: true,
    timestamps: true,
  }
);

Round.belongsTo(Tournament, { foreignKey: "tournament_id" });
Tournament.hasMany(Round, { foreignKey: "tournament_id" });

export default Round;
