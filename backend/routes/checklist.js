const express = require("express");
const router = express.Router();
const pool = require("../db");

async function gerarChecklistDoDia() {
	return pool.query(
		`INSERT INTO checklist_dias (item_id, data, concluido)
		 SELECT item.id, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, FALSE
		 FROM checklist_itens AS item
		 WHERE item.ativo = TRUE
		 ON CONFLICT (item_id, data) DO NOTHING
		 RETURNING id`
	);
}

router.get("/dia", async (req, res) => {
	try {
		await gerarChecklistDoDia();

		const result = await pool.query(
			`SELECT
				 dia.item_id,
				 item.descricao,
				 dia.concluido,
				 dia.responsavel_id,
				 funcionario.nome AS responsavel
			 FROM checklist_dias AS dia
			 JOIN checklist_itens AS item ON item.id = dia.item_id
			 LEFT JOIN funcionarios AS funcionario ON funcionario.id = dia.responsavel_id
			 WHERE dia.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
			 ORDER BY dia.id`
		);

		res.status(200).json(result.rows);
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.post("/itens", async (req, res) => {
	const descricao = typeof req.body.descricao === "string"
		? req.body.descricao.trim()
		: "";

	if (!descricao) {
		return res.status(400).json({ erro: "A descrição do item é obrigatória." });
	}

	try {
		const result = await pool.query(
			`INSERT INTO checklist_itens (descricao, ativo)
			 VALUES ($1, TRUE)
			 RETURNING id AS item_id, descricao, ativo`,
			[descricao]
		);

		res.status(201).json(result.rows[0]);
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.post("/gerar-dia", async (req, res) => {
	try {
		const result = await gerarChecklistDoDia();

		res.status(201).json({
			message: "Checklist do dia gerado com sucesso.",
			quantidade_gerada: result.rowCount,
		});
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.post("/reiniciar-dia", async (req, res) => {
	const funcionarioId = Number(req.body.funcionario_id);

	if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
		return res.status(400).json({ erro: "Identificador do administrador inválido." });
	}

	try {
		const administrador = await pool.query(
			"SELECT id FROM funcionarios WHERE id = $1 AND is_admin = TRUE",
			[funcionarioId]
		);

		if (administrador.rowCount === 0) {
			return res.status(403).json({ erro: "Somente um administrador pode reiniciar o checklist." });
		}

		const result = await pool.query(
			`UPDATE checklist_dias
			 SET concluido = FALSE,
				 responsavel_id = NULL,
				 concluido_em = NULL
			 WHERE data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
			   AND concluido = TRUE`
		);

		res.status(200).json({
			message: "Checklist de hoje reiniciado com sucesso.",
			quantidade_reiniciada: result.rowCount,
		});
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.put("/concluir", async (req, res) => {
	const { item_id, funcionario_id } = req.body;
	const concluido = req.body.concluido === undefined
		? true
		: req.body.concluido;

	if (!Number.isInteger(Number(item_id)) || Number(item_id) <= 0) {
		return res.status(400).json({ erro: "item_id inválido." });
	}

	if (!Number.isInteger(Number(funcionario_id)) || Number(funcionario_id) <= 0) {
		return res.status(400).json({ erro: "funcionario_id inválido." });
	}

	if (typeof concluido !== "boolean") {
		return res.status(400).json({ erro: "concluido deve ser true ou false." });
	}

	if (!concluido) {
		return res.status(409).json({
			erro: "Um item concluído permanece concluído até o fim do dia.",
		});
	}

	try {
		const result = await pool.query(
			`UPDATE checklist_dias
			 SET concluido = $1,
					 responsavel_id = CASE WHEN $1 THEN CAST($2 AS BIGINT) ELSE NULL END,
					 concluido_em = CASE WHEN $1 THEN NOW() ELSE NULL END
			 WHERE item_id = $3
			   AND data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
			 RETURNING item_id, data, concluido, responsavel_id, concluido_em`,
			[concluido, Number(funcionario_id), Number(item_id)]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ erro: "Item não encontrado no checklist de hoje." });
		}

		res.status(200).json(result.rows[0]);
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

module.exports = router;
