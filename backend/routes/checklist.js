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
		 ORDER BY item.ordem, item.id
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
			 ORDER BY item.ordem, dia.id`
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
			`INSERT INTO checklist_itens (descricao, ativo, ordem)
			 VALUES (
			   $1,
			   TRUE,
			   COALESCE((SELECT MAX(ordem) + 1 FROM checklist_itens), 1)
			 )
			 RETURNING id AS item_id, descricao, ativo, ordem`,
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

router.put("/itens/:id/mover", autenticarAdmin, async (req, res) => {
	const itemId = Number(req.params.id);
	const direcao = req.body.direcao;

	if (!Number.isInteger(itemId) || itemId <= 0) {
		return res.status(400).json({ erro: "Identificador do item inválido." });
	}
	if (direcao !== "cima" && direcao !== "baixo") {
		return res.status(400).json({ erro: "A direção deve ser 'cima' ou 'baixo'." });
	}

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const lista = await client.query(
			`SELECT id, ordem
			 FROM checklist_itens
			 WHERE ativo = TRUE
			 ORDER BY ordem, id
			 FOR UPDATE`
		);
		const itensOrdenados = [...lista.rows];
		const indice = itensOrdenados.findIndex((item) => Number(item.id) === itemId);

		if (indice === -1) {
			await client.query("ROLLBACK");
			return res.status(404).json({ erro: "Item não encontrado." });
		}

		const indiceDestino = direcao === "cima" ? indice - 1 : indice + 1;
		if (indiceDestino >= 0 && indiceDestino < itensOrdenados.length) {
			[itensOrdenados[indice], itensOrdenados[indiceDestino]] =
				[itensOrdenados[indiceDestino], itensOrdenados[indice]];

			for (let posicao = 0; posicao < itensOrdenados.length; posicao += 1) {
				await client.query(
					"UPDATE checklist_itens SET ordem = $1 WHERE id = $2",
					[posicao + 1, itensOrdenados[posicao].id]
				);
			}
		}

		await client.query("COMMIT");
		const resultado = await client.query(
			`SELECT id AS item_id, descricao, ordem
			 FROM checklist_itens
			 WHERE ativo = TRUE
			 ORDER BY ordem, id`
		);
		res.status(200).json({ itens: resultado.rows });
	} catch (error) {
		await client.query("ROLLBACK");
		res.status(500).json({ erro: error.message });
	} finally {
		client.release();
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

router.get("/relatorio/dados", autenticarAdmin, async (req, res) => {
	try {
		const hoje = new Intl.DateTimeFormat("en-CA", {
			timeZone: "America/Sao_Paulo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date());
		const inicio = typeof req.query.inicio === "string" ? req.query.inicio : hoje;
		const fim = typeof req.query.fim === "string" ? req.query.fim : inicio;
		const dataValida = (data) => {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
			const parseada = new Date(`${data}T00:00:00Z`);
			return !Number.isNaN(parseada.getTime()) && parseada.toISOString().slice(0, 10) === data;
		};

		if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) {
			return res.status(400).json({ erro: "Informe um período válido, com a data inicial anterior ou igual à final." });
		}

		if (inicio <= hoje && fim >= hoje) {
			await gerarChecklistDoDia();
		}

		const [itens, funcionarios] = await Promise.all([
			pool.query(
				`SELECT
					 item.id AS item_id,
					 item.descricao,
					 COUNT(dia.id)::int AS ocorrencias,
					 COUNT(dia.id) FILTER (WHERE dia.concluido)::int AS concluidos
				 FROM checklist_itens AS item
				 LEFT JOIN checklist_dias AS dia
				   ON dia.item_id = item.id
				  AND dia.data BETWEEN $1::date AND $2::date
				 WHERE item.ativo = TRUE OR dia.id IS NOT NULL
				 GROUP BY item.id, item.descricao, item.ordem
				 ORDER BY item.ordem, item.id`,
				[inicio, fim]
			),
			pool.query(
				`SELECT
					 dia.item_id,
					 funcionario.nome,
					 COUNT(*)::int AS quantidade
				 FROM checklist_dias AS dia
				 JOIN funcionarios AS funcionario ON funcionario.id = dia.responsavel_id
				 WHERE dia.data BETWEEN $1::date AND $2::date
				   AND dia.concluido = TRUE
				 GROUP BY dia.item_id, funcionario.id, funcionario.nome
				 ORDER BY dia.item_id, funcionario.nome`,
				[inicio, fim]
			),
		]);

		const porItem = new Map();
		for (const funcionario of funcionarios.rows) {
			const lista = porItem.get(funcionario.item_id) || [];
			lista.push({ nome: funcionario.nome, quantidade: funcionario.quantidade });
			porItem.set(funcionario.item_id, lista);
		}

		const itensRelatorio = itens.rows.map((item) => ({
			...item,
			funcionarios: porItem.get(item.item_id) || [],
		}));

		res.status(200).json({
			inicio,
			fim,
			total_ocorrencias: itensRelatorio.reduce((total, item) => total + item.ocorrencias, 0),
			total_concluidos: itensRelatorio.reduce((total, item) => total + item.concluidos, 0),
			itens: itensRelatorio,
		});
	} catch (error) {
		res.status(500).json({ erro: error.message });
	}
});

router.get("/relatorio/pdf", autenticarAdmin, async (req, res) => {
	try {
		const hoje = new Intl.DateTimeFormat("en-CA", {
					timeZone: "America/Sao_Paulo",
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
				}).format(new Date());
		const dataInicial = typeof req.query.inicio === "string"
			? req.query.inicio
			: typeof req.query.data === "string" ? req.query.data : hoje;
		const dataFinal = typeof req.query.fim === "string"
			? req.query.fim
			: typeof req.query.data === "string" ? req.query.data : dataInicial;
		const dataISOValida = (data) => {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
			const dataParseada = new Date(`${data}T00:00:00Z`);
			return !Number.isNaN(dataParseada.getTime()) &&
				dataParseada.toISOString().slice(0, 10) === data;
		};

		if (!dataISOValida(dataInicial) || !dataISOValida(dataFinal) || dataInicial > dataFinal) {
			return res.status(400).json({ erro: "Informe um período válido, com a data inicial anterior ou igual à final." });
		}

		if (dataInicial <= hoje && dataFinal >= hoje) {
			await gerarChecklistDoDia();
		}

		const [itens, funcionarios] = await Promise.all([
			pool.query(
			`SELECT
				 item.id AS item_id,
				 item.descricao,
				 COUNT(dia.id)::int AS ocorrencias,
				 COUNT(dia.id) FILTER (WHERE dia.concluido)::int AS concluidos
			 FROM checklist_itens AS item
			 LEFT JOIN checklist_dias AS dia
			   ON dia.item_id = item.id
			  AND dia.data BETWEEN $1::date AND $2::date
			 WHERE item.ativo = TRUE OR dia.id IS NOT NULL
			 GROUP BY item.id, item.descricao, item.ordem
			 ORDER BY item.ordem, item.id`,
			[dataInicial, dataFinal]
			),
			pool.query(
				`SELECT
					 dia.item_id,
					 funcionario.nome AS responsavel,
					 COUNT(*)::int AS vezes_concluido
				 FROM checklist_dias AS dia
				 JOIN checklist_itens AS item ON item.id = dia.item_id
				 JOIN funcionarios AS funcionario ON funcionario.id = dia.responsavel_id
				 WHERE dia.data BETWEEN $1::date AND $2::date
				   AND dia.concluido = TRUE
				 GROUP BY dia.item_id, funcionario.id, funcionario.nome
				 ORDER BY item_id, funcionario.nome`,
				[dataInicial, dataFinal]
			),
		]);

		const formatarData = (data) => new Intl.DateTimeFormat("pt-BR", {
			timeZone: "UTC",
		}).format(new Date(`${data}T12:00:00Z`));
		const periodoFormatado = dataInicial === dataFinal
			? formatarData(dataInicial)
			: `${formatarData(dataInicial)} a ${formatarData(dataFinal)}`;
		const agora = new Intl.DateTimeFormat("pt-BR", {
			timeZone: "America/Sao_Paulo",
			dateStyle: "short",
		}).format(new Date());
		const concluidos = itens.rows.reduce((total, item) => total + item.concluidos, 0);
		const resumoPorItem = new Map();
		for (const funcionario of funcionarios.rows) {
			const lista = resumoPorItem.get(funcionario.item_id) || [];
			lista.push(funcionario);
			resumoPorItem.set(funcionario.item_id, lista);
		}
		const linhas = [
			"RELATORIO DO CHECKLIST POR PERIODO",
			`Periodo: ${periodoFormatado}`,
			`Gerado em: ${agora}`,
			"",
			`Resumo: ${concluidos} conclusoes em ${itens.rows.reduce((total, item) => total + item.ocorrencias, 0)} ocorrencias de itens`,
			"",
		];

		if (itens.rows.length === 0) {
			linhas.push("Nenhum item encontrado neste periodo.");
		} else {
			itens.rows.forEach((item, indice) => {
				linhas.push(`${indice + 1}. ${item.descricao}`);
				linhas.push(`Concluido ${item.concluidos} vez(es) em ${item.ocorrencias} ocorrencia(s)`);
				const realizadosPor = resumoPorItem.get(item.item_id) || [];
				if (realizadosPor.length) {
					linhas.push("Realizacoes por funcionario:");
					realizadosPor.forEach((funcionario) => {
						linhas.push(`- ${funcionario.responsavel}: ${funcionario.vezes_concluido} vez(es)`);
					});
				} else {
					linhas.push("Sem conclusoes registradas neste periodo.");
				}
				linhas.push("");
			});
		}

		const pdf = criarPdf(linhas);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `attachment; filename="relatorio-checklist-${dataInicial}-a-${dataFinal}.pdf"`);
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
