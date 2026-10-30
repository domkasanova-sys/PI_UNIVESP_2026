const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/tarefas", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        tarefas.id AS tarefa_id,
        tarefas.titulo,
        tarefas.descricao,
        tarefas.funcionario_id,
        tarefas.prazo,
        tarefas.finalizado,
        tarefas.observacao,
        funcionarios.nome AS funcionario_nome
      FROM tarefas
      LEFT JOIN funcionarios ON tarefas.funcionario_id = funcionarios.id`
    );

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/minhas/:funcionario_id", async (req, res) => {
  const funcionarioId = Number(req.params.funcionario_id);

  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    return res.status(400).json({ error: "Identificador do funcionário inválido." });
  }

  try {
    const result = await pool.query(
      `SELECT id AS tarefa_id, titulo, descricao, funcionario_id, prazo, finalizado, observacao
       FROM tarefas
       WHERE funcionario_id = $1
       ORDER BY finalizado ASC, prazo ASC NULLS LAST, id DESC`,
      [funcionarioId]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/tarefas/:id/execucao", async (req, res) => {
  const tarefaId = Number(req.params.id);
  const funcionarioId = Number(req.body.funcionario_id);
  const observacao = typeof req.body.observacao === "string"
    ? req.body.observacao.trim()
    : "";
  const concluir = req.body.finalizado === true;

  if (!Number.isInteger(tarefaId) || tarefaId <= 0 || !Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    return res.status(400).json({ error: "Identificador de tarefa ou funcionário inválido." });
  }

  if (observacao.length > 2000) {
    return res.status(400).json({ error: "A observação deve ter no máximo 2000 caracteres." });
  }

  try {
    const result = await pool.query(
      `UPDATE tarefas
       SET observacao = $1,
           finalizado = finalizado OR $2
       WHERE id = $3 AND funcionario_id = $4
       RETURNING id AS tarefa_id, titulo, descricao, funcionario_id, prazo, finalizado, observacao`,
      [observacao, concluir, tarefaId, funcionarioId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Tarefa não encontrada para este funcionário." });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/tarefas/criar", async (req, res) => {
  const { titulo, descricao, funcionario_id, prazo } = req.body;
  const finalizado = typeof req.body.finalizado === "boolean"
    ? req.body.finalizado
    : false;

  try {
    const result = await pool.query(
      `INSERT INTO tarefas (titulo, descricao, funcionario_id, prazo, finalizado)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [titulo, descricao, funcionario_id || null, prazo, finalizado]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/tarefas/:id", async (req, res) => {
  const { id } = req.params;
  const { titulo, descricao, funcionario_id, prazo, finalizado, observacao } = req.body;

  try {
    const result = await pool.query(
      `UPDATE tarefas 
       SET titulo = $1,
           descricao = $2,
           funcionario_id = $3, 
             prazo = $4,
             finalizado = COALESCE($5, finalizado),
             observacao = COALESCE($6, observacao)
           WHERE id = $7
       RETURNING *`,
          [titulo, descricao, funcionario_id, prazo, finalizado ?? null, observacao ?? null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Tarefa não encontrada" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/tarefas/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM tarefas WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Tarefa não encontrada" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;