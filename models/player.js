import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Player = sequelize.define(
  "player",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    full_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
    },
    country: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
    age: {
      type: DataTypes.INTEGER,
    },
  },
  {
    freezeTableName: true,
    timestamps: true,
  }
);

export default Player;
