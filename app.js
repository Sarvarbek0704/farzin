import express from "express";
import config from "config";
import sequelize from "./config/db.js";
import cookieParser from "cookie-parser";
import MainRouter from "./routes/index.js";

const app = express();

const PORT = config.get("port") ?? 7777;

app.use(express.json());
app.use(cookieParser());

app.use("/api", MainRouter);

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    app.listen(PORT, () => {
      console.log(`Server started at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};
start();
