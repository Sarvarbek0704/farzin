import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import Chess_type from "./chess_type.js";

const Tournament = sequelize.define(
  "tournament",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
    type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
    start_date: {
      type: DataTypes.DATE(),
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATE(),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
    round: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
  },
  {
    freezeTableName: true,
    timestamps: true,
  }
);

Tournament.belongsTo(Chess_type, { foreignKey: "type_id" });
Chess_type.hasMany(Tournament, { foreignKey: "type_id" });

export default Tournament;
