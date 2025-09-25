import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Admin = sequelize.define(
  "admin",
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
    email: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    phone_number: {
      type: DataTypes.STRING(15),
    },
    password: {
      type: DataTypes.STRING(),
      allowNull: false,
    },
    is_creater: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    refresh_token: {
      type: DataTypes.STRING(255),
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

export default Admin;
