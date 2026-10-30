const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

router.post("/cadastro", async (req, res) => {
  const { nome, cargo, username, senha } = req.body;

  try {
    let senhaHash = null;

    if (senha) {
      senhaHash = await bcrypt.hash(senha, 10);
    }

    const result  = await pool.query(
      `INSERT INTO funcionarios (nome, cargo, username, senha)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nome, cargo, username || null, senhaHash],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { username, senha } = req.body;

  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    return res.status(503).json({ error: "Autenticação indisponível no momento." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM funcionarios WHERE username = $1",
      [username],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    }

    const user = result.rows[0];

    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    }

    const token = jwt.sign({}, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: String(user.id),
      expiresIn: "7d",
    });

    res.status(200).json({
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        cargo: user.cargo,
        username: user.username,
        is_admin: user.is_admin,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
