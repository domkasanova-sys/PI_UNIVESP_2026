const express = require('express');
const cors = require('cors');
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

app.listen(PORT, () => console.log(`API rodando na porta ${PORT} 🚀`));