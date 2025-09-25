export default function selfGuard(req, res, next) {
  const userId = req.user.id;
  const targetId = req.params.id;

  if (+userId != +targetId) {
    return res
      .status(403)
      .json({ message: "Siz faqat o'zingizni o'zgartira olasiz" });
  }

  next();
}
