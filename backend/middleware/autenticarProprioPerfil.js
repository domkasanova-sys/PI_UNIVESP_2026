const jwt = require("jsonwebtoken");

function autenticarProprioPerfil(req, res, next) {
  const segredo = process.env.JWT_SECRET;
  if (!segredo || Buffer.byteLength(segredo) < 32) {
    return res.status(503).json({ error: "Autenticação indisponível no momento." });
  }

  const autorizacao = req.get("Authorization");
  const correspondencia = autorizacao?.match(/^Bearer ([^\s]+)$/);
  if (!correspondencia) {
    return res.status(401).json({ error: "Autenticação necessária." });
  }

  let token;
  try {
    token = jwt.verify(correspondencia[1], segredo, { algorithms: ["HS256"] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }
    return next(error);
  }

  if (!token || typeof token !== "object") {
    return res.status(401).json({ error: "Sessão inválida." });
  }

  const idUsuario = Number(token.sub);
  const idPerfil = Number(req.params.id);
  if (!Number.isInteger(idUsuario) || idUsuario < 1) {
    return res.status(401).json({ error: "Sessão inválida." });
  }
  if (!Number.isInteger(idPerfil) || idPerfil < 1) {
    return res.status(400).json({ error: "Identificador do funcionário inválido." });
  }
  if (idUsuario !== idPerfil) {
    return res.status(403).json({ error: "Só é permitido alterar a própria foto." });
  }

  return next();
}

module.exports = autenticarProprioPerfil;
