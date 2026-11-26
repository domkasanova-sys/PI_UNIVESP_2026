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

function quebrarLinha(valor, limite = 92) {
  const texto = removerAcentos(valor);
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = "";

  for (const palavra of palavras) {
    if ((atual + (atual ? " " : "") + palavra).length <= limite) {
      atual += (atual ? " " : "") + palavra;
    } else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }

  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
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

  const objetos = [];
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  const idsPaginas = [];

  for (let i = 0; i < paginas.length; i += 1) {
    idsPaginas.push(3 + i * 2);
  }

  objetos.push(`<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`);
  const idFonte = 3 + (paginas.length * 2);

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

router.get("/relatorio/pdf", autenticarAdmin, async (req, res) => {
  try {
    const [tarefas, checklist] = await Promise.all([
      pool.query(
        `SELECT tarefas.titulo, tarefas.descricao, tarefas.prazo, tarefas.finalizado,
                tarefas.observacao, funcionarios.nome AS funcionario_nome
         FROM tarefas
         LEFT JOIN funcionarios ON tarefas.funcionario_id = funcionarios.id
         ORDER BY tarefas.finalizado ASC, tarefas.prazo ASC NULLS LAST, tarefas.id DESC`
      ),
      pool.query(
        `SELECT item.descricao, dia.concluido, funcionario.nome AS responsavel
         FROM checklist_dias AS dia
         JOIN checklist_itens AS item ON item.id = dia.item_id
         LEFT JOIN funcionarios AS funcionario ON funcionario.id = dia.responsavel_id
         WHERE dia.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
         ORDER BY dia.id`
      ),
    ]);

    const agora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
    }).format(new Date());
    const linhas = [
      "RELATORIO DE TAREFAS E CHECKLIST",
      `Gerado em: ${agora}`,
      "",
      `Resumo: ${tarefas.rows.filter((item) => item.finalizado).length} tarefas concluidas de ${tarefas.rows.length}`,
      `Checklist: ${checklist.rows.filter((item) => item.concluido).length} concluidos de ${checklist.rows.length}`,
      "",
      "TAREFAS",
    ];

    if (tarefas.rows.length === 0) {
      linhas.push("Nenhuma tarefa cadastrada.");
    } else {
      tarefas.rows.forEach((item, indice) => {
        const prazo = item.prazo
          ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(item.prazo))
          : "Nao informado";
        linhas.push(`${indice + 1}. ${item.titulo || "Sem titulo"}`);
        linhas.push(`Responsavel: ${item.funcionario_nome || "Sem responsavel"} | Prazo: ${prazo}`);
        linhas.push(`Status: ${item.finalizado ? "Concluida" : "Pendente"}`);
        if (item.descricao) {
          quebrarLinha(`Descricao: ${item.descricao}`).forEach((linha) => linhas.push(linha));
        }
        if (item.observacao) {
          quebrarLinha(`Observacao: ${item.observacao}`).forEach((linha) => linhas.push(linha));
        }
        linhas.push("");
      });
    }

    linhas.push("CHECKLIST DE HOJE");
    if (checklist.rows.length === 0) {
      linhas.push("Nenhum item gerado para hoje.");
    } else {
      checklist.rows.forEach((item, indice) => {
        linhas.push(`${indice + 1}. ${item.descricao}`);
        linhas.push(`Status: ${item.concluido ? "Concluido" : "Pendente"} | Responsavel: ${item.responsavel || "Nao informado"}`);
      });
    }

    const pdf = criarPdf(linhas);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-tarefas-checklist-${agora.replace(/\//g, "-")}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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