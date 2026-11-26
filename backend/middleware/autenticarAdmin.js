const jwt = require("jsonwebtoken");
const pool = require("../db");

async function autenticarAdmin(req, res, next) {
  const segredo = process.env.JWT_SECRET;
  if (!segredo || Buffer.byteLength(segredo) < 32) {
    return res.status(503).json({ error: "Autenticação indisponível no momento." });
  }

  const autorizacao = req.get("Authorization");
  const correspondencia = autorizacao?.match(/^Bearer ([^\s]+)$/);
  if (!correspondencia) {
    return res.status(401).json({ error: "Autenticação necessária." });
  }

  try {
    const token = jwt.verify(correspondencia[1], segredo, { algorithms: ["HS256"] });
    const usuarioId = Number(token.sub);

    if (!Number.isInteger(usuarioId) || usuarioId < 1) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const administrador = await pool.query(
      "SELECT id FROM funcionarios WHERE id = $1 AND is_admin = TRUE",
      [usuarioId]
    );

    if (administrador.rowCount === 0) {
      return res.status(403).json({ error: "Acesso restrito a administradores." });
    }

    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
    return next(error);
  }
}

module.exports = autenticarAdmin;
