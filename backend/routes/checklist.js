const express = require("express");
const router = express.Router();
const pool = require("../db");
const autenticarAdmin = require("../middleware/autenticarAdmin");

function removerAcentos(valor) {
	return String(valor || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function escaparPdf(valor) {
	return removerAcentos(valor)
		.replace(/\\/g, "\\\\")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)");
}

function criarPdf(linhas) {
	const largura = 595;
	const altura = 842;
	const margemX = 50;
	let y = 790;
	const paginas = [[]];

	for (const linha of linhas) {
		if (y < 55) {
			paginas.push([]);
			y = 790;
		}
		paginas[paginas.length - 1].push(`BT /F1 10 Tf ${margemX} ${y} Td (${escaparPdf(linha)}) Tj ET`);
		y -= 16;
	}

	const objetos = ["<< /Type /Catalog /Pages 2 0 R >>"];
	const idsPaginas = [];

	for (let i = 0; i < paginas.length; i += 1) {
		idsPaginas.push(3 + i * 2);
	}

	objetos.push(`<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`);
	const idFonte = 3 + paginas.length * 2;

	paginas.forEach((conteudo, indice) => {
		const stream = conteudo.join("\n");
		const idPagina = 3 + indice * 2;
		const idConteudo = idPagina + 1;
		objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] /Resources << /Font << /F1 ${idFonte} 0 R >> >> /Contents ${idConteudo} 0 R >>`);
		objetos.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
	});

	objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

	let pdf = "%PDF-1.4\n";
	const offsets = [0];

	objetos.forEach((objeto, indice) => {
		offsets.push(Buffer.byteLength(pdf, "utf8"));
		pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
	});

	const inicioXref = Buffer.byteLength(pdf, "utf8");
	pdf += `xref\n0 ${objetos.length + 1}\n`;
	pdf += "0000000000 65535 f \n";
	for (let i = 1; i <= objetos.length; i += 1) {
		pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

	return Buffer.from(pdf, "utf8");
}

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
			   AND item.ativo = TRUE
			 ORDER BY dia.id`
		);

		res.status(200).json(result.rows);
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.post("/itens", autenticarAdmin, async (req, res) => {
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

router.put("/itens/:id", autenticarAdmin, async (req, res) => {
	const itemId = Number(req.params.id);
	const descricao = typeof req.body.descricao === "string"
		? req.body.descricao.trim()
		: "";

	if (!Number.isInteger(itemId) || itemId <= 0) {
		return res.status(400).json({ erro: "Identificador do item inválido." });
	}
	if (!descricao) {
		return res.status(400).json({ erro: "A descrição do item é obrigatória." });
	}

	try {
		const result = await pool.query(
			`UPDATE checklist_itens
			 SET descricao = $1
			 WHERE id = $2 AND ativo = TRUE
			 RETURNING id AS item_id, descricao, ativo`,
			[descricao, itemId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ erro: "Item não encontrado." });
		}

		res.status(200).json(result.rows[0]);
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.delete("/itens/:id", autenticarAdmin, async (req, res) => {
	const itemId = Number(req.params.id);

	if (!Number.isInteger(itemId) || itemId <= 0) {
		return res.status(400).json({ erro: "Identificador do item inválido." });
	}

	try {
		const result = await pool.query(
			`UPDATE checklist_itens
			 SET ativo = FALSE
			 WHERE id = $1 AND ativo = TRUE
			 RETURNING id AS item_id, descricao, ativo`
			,
			[itemId]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ erro: "Item não encontrado." });
		}

		await pool.query(
			`DELETE FROM checklist_dias
			 WHERE item_id = $1
			   AND data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
			[itemId]
		);

		res.status(200).json(result.rows[0]);
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

router.get("/relatorio/pdf", autenticarAdmin, async (req, res) => {
	try {
		await gerarChecklistDoDia();

		const result = await pool.query(
			`SELECT
				 item.descricao,
				 dia.concluido,
				 funcionario.nome AS responsavel,
				 dia.concluido_em
			 FROM checklist_dias AS dia
			 JOIN checklist_itens AS item ON item.id = dia.item_id
			 LEFT JOIN funcionarios AS funcionario ON funcionario.id = dia.responsavel_id
			 WHERE dia.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
			 ORDER BY dia.id`
		);

		const agora = new Intl.DateTimeFormat("pt-BR", {
			timeZone: "America/Sao_Paulo",
			dateStyle: "short",
		}).format(new Date());
		const concluidos = result.rows.filter((item) => item.concluido).length;
		const linhas = [
			"RELATORIO DO CHECKLIST DIARIO",
			`Gerado em: ${agora}`,
			"",
			`Resumo: ${concluidos} concluidos de ${result.rows.length} itens`,
			"",
		];

		if (result.rows.length === 0) {
			linhas.push("Nenhum item gerado para hoje.");
		} else {
			result.rows.forEach((item, indice) => {
				let conclusao = "";
				if (item.concluido_em) {
					conclusao = new Intl.DateTimeFormat("pt-BR", {
						timeZone: "America/Sao_Paulo",
						dateStyle: "short",
						timeStyle: "short",
					}).format(new Date(item.concluido_em));
				}

				linhas.push(`${indice + 1}. ${item.descricao}`);
				linhas.push(`Status: ${item.concluido ? "Concluido" : "Pendente"} | Responsavel: ${item.responsavel || "Nao informado"}`);
				if (conclusao) linhas.push(`Concluido em: ${conclusao}`);
				linhas.push("");
			});
		}

		const pdf = criarPdf(linhas);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `attachment; filename="relatorio-checklist-${agora.replace(/\//g, "-")}.pdf"`);
		res.status(200).send(pdf);
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
