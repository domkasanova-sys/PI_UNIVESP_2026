const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const autenticarProprioPerfil = require("../middleware/autenticarProprioPerfil");

function idValido(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/:id/foto", async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identificador do funcionário inválido." });
  }

  try {
    const result = await pool.query(
      "SELECT foto_perfil FROM funcionarios WHERE id = $1",
      [id]
    );

    if (result.rowCount === 0 || !result.rows[0].foto_perfil) {
      return res.status(404).end();
    }

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.status(200).send(result.rows[0].foto_perfil);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/:id/foto", autenticarProprioPerfil, express.raw({ type: "image/jpeg", limit: "1mb" }), async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identificador do funcionário inválido." });
  }

  if (
    !Buffer.isBuffer(req.body) ||
    req.body.length < 3 ||
    req.body[0] !== 0xff ||
    req.body[1] !== 0xd8 ||
    req.body[2] !== 0xff
  ) {
    return res.status(400).json({ error: "Envie uma imagem JPEG válida." });
  }

  try {
    const result = await pool.query(
      `UPDATE funcionarios
       SET foto_perfil = $1,
           foto_perfil_atualizada_em = NOW()
       WHERE id = $2
       RETURNING id, foto_perfil_atualizada_em`,
      [req.body, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Funcionário não encontrado." });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/:id/foto", autenticarProprioPerfil, async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identificador do funcionário inválido." });
  }

  try {
    const result = await pool.query(
      `UPDATE funcionarios
       SET foto_perfil = NULL,
           foto_perfil_atualizada_em = NULL
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Funcionário não encontrado." });
    }

    return res.status(200).json({ message: "Foto de perfil removida." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req, res) => {
  const { nome } = req.query;

  try {
    let result;

    if (nome) {
      result = await pool.query(
        `SELECT id, nome, cargo, username, is_admin, foto_perfil_atualizada_em
         FROM funcionarios WHERE nome ILIKE $1`,
        [`%${nome}%`],
      );
    } else {
      result = await pool.query(
        "SELECT id, nome, cargo, username, is_admin, foto_perfil_atualizada_em FROM funcionarios"
      );
    }

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/criar", async (req, res) => {
  const { nome, cargo, username, senha, is_admin } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO funcionarios (nome, cargo, username, senha, is_admin) 
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
      [nome, cargo, username || null, senha || null, is_admin || false],
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/criar/interno", async (req, res) => {
  const { nome, cargo, username, is_admin } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO funcionarios (nome, cargo, username) 
            VALUES ($1, $2, $3),
            RETURNING *`,
      [nome, cargo, username || null],
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, cargo, username, senha, is_admin } = req.body;

  try {
    const senhaHash = senha ? await bcrypt.hash(senha, 10) : null;

    const result = await pool.query(
      `UPDATE funcionarios 
                SET nome = COALESCE($1, nome),
                    cargo = COALESCE($2, cargo),
                    username = COALESCE($3, username),
                    is_admin = COALESCE($4, is_admin),
                    senha = COALESCE($5, senha)
            WHERE id = $6
          RETURNING id, nome, cargo, username, is_admin, foto_perfil_atualizada_em`,
      [nome, cargo, username, is_admin, senhaHash, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Funcionário não encontrado" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id/admin", async (req, res) => {
  const { id } = req.params;
  const { is_admin } = req.body;

  try {
    const result = await pool.query(
      `UPDATE funcionarios 
                SET 
                    is_admin = COALESCE($1, is_admin)
            WHERE id = $2
          RETURNING *`,
      [is_admin, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Funcionário não encontrado" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM funcionarios WHERE id = $1 RETURNING *", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Funcionário não encontrado" });
    }
    res.status(200).json({ message: "Funcionário excluído com sucesso" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
