const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); 

const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/funcionarios', require('./routes/funcionarios'));
app.use('/escalas', require('./routes/escalas'));
app.use('/tarefas', require('./routes/tarefas'));
app.use('/checklist', require('./routes/checklist'));

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no banco');
  }
});

const PORT = process.env.PORT || 3000;

async function iniciarServidor() {
  try {
    const migracaoTarefas = fs.readFileSync(
      path.join(__dirname, "migrations", "001_tarefas_observacao.sql"),
      "utf8"
    );
    await pool.query(migracaoTarefas);

    app.listen(PORT, () => console.log(`API rodando na porta ${PORT} 🚀`));
  } catch (error) {
    console.error("Não foi possível preparar o banco para iniciar a API:", error);
    process.exitCode = 1;
  }
}

iniciarServidor();