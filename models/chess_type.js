import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Chess_type = sequelize.define(
  "chess_type",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    category: {
      type: DataTypes.ENUM("bullet", "blitz", "rapid", "correspondence"),
      allowNull: false,
    },
    base_time_minutes: {
      type: DataTypes.ENUM("1", "2", "3", "5", "10", "15", "30"),
      allowNull: false,
    },
    increment_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

export default Chess_type;
