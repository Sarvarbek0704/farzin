const sendErrorResponse = (error, res, status) => {
  if (error.name == "SequelizeForeignKeyConstraintError") {
    return res.status(400).send({
      message: "SequelizeForeignKeyConstraintError",
    });
  }
  res.status(status).send({
    message: "Error",
    error: error.message,
  });
};

export { sendErrorResponse };
