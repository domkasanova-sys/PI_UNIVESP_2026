import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { formatarDataBR } from "../../utils/formatters";
import "./index.css";

function Tarefas() {
  const [modoEdicao, setModoEdicao] = useState(false);
  const [idEdicao, setIdEdicao] = useState(null);
  const [busca, setBusca] = useState("");

  const [funcionarios, setFuncionarios] = useState([]);

  const [tarefa, setTarefa] = useState({
    titulo: "",
    descricao: "",
    responsavel: "",
    prazo: "",
    finalizado: false,
  });

  const [tarefas, setTarefas] = useState([]);

  async function carregarTarefas() {
    try {
      const resposta = await api.get("/tarefas/tarefas");

      const tarefasFormatadas = resposta.data.map((item) => ({
        id: item.tarefa_id || item.id,
        titulo: item.titulo,
        descricao: item.descricao,
        responsavel: item.funcionario_nome || "Sem responsável",
        funcionario_id: item.funcionario_id,
        prazo: formatarDataBR(item.prazo),
        finalizado: Boolean(item.finalizado),
        observacao: item.observacao || "",
        prazoInput: item.prazo ? item.prazo.substring(0, 10) : "",
      }));

      setTarefas(tarefasFormatadas);
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar tarefas do banco.");
    }
  }

  useEffect(() => {
    let ativo = true;

    Promise.all([
      api.get("/tarefas/tarefas"),
      api.get("/funcionarios"),
    ]).then(([respostaTarefas, respostaFuncionarios]) => {
      if (!ativo) return;

      const tarefasFormatadas = respostaTarefas.data.map((item) => ({
        id: item.tarefa_id || item.id,
        titulo: item.titulo,
        descricao: item.descricao,
        responsavel: item.funcionario_nome || "Sem responsável",
        funcionario_id: item.funcionario_id,
        prazo: formatarDataBR(item.prazo),
        finalizado: Boolean(item.finalizado),
        observacao: item.observacao || "",
        prazoInput: item.prazo ? item.prazo.substring(0, 10) : "",
      }));

      setTarefas(tarefasFormatadas);
      setFuncionarios(respostaFuncionarios.data);
    });

    return () => {
      ativo = false;
    };
  }, []);

  function limparFormulario() {
    setTarefa({
      titulo: "",
      descricao: "",
      responsavel: "",
      prazo: "",
      finalizado: false,
    });

    setModoEdicao(false);
    setIdEdicao(null);
  }

  async function salvarTarefa() {
    if (
      !tarefa.titulo ||
      !tarefa.descricao ||
      !tarefa.responsavel ||
      !tarefa.prazo
    ) {
      alert("Preencha todos os campos obrigatórios!");
      return;
    }

    try {
      if (modoEdicao) {
        await api.put(`/tarefas/tarefas/${idEdicao}`, {
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          funcionario_id: tarefa.responsavel,
          prazo: tarefa.prazo,
          finalizado: tarefa.finalizado,
        });

        alert("Tarefa editada com sucesso!");
      } else {
        await api.post("/tarefas/tarefas/criar", {
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          funcionario_id: tarefa.responsavel,
          prazo: tarefa.prazo,
          finalizado: tarefa.finalizado,
        });

        alert("Tarefa criada no banco!");
      }

      limparFormulario();
      carregarTarefas();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar tarefa no banco.");
    }
  }

  async function excluirTarefa(id) {
    try {
      const confirmarExcluirTarefa = window.confirm("Tem certeza que deseja excluir a tarefa?");
      if (!confirmarExcluirTarefa) return;
      await api.delete(`/tarefas/tarefas/${id}`);
      alert("Tarefa excluída com sucesso!");
      carregarTarefas();
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir tarefa.");
    }
  }

  return (

    <Layout title="Gestão - Tarefas" ativo="Gestão de Tarefas">
      <div className="containerTarefas">
        <div className="buscaTarefasContainer">
          <label className="buscaTarefasLabel">Buscar tarefa</label>
          <div className="buscaTarefasInputContainer">
            <span className="buscaTarefasIcone">🔍</span>
            <input
              placeholder="Nome da tarefa"
              className="buscaTarefasInput"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        <div className="tituloSecao">
          {modoEdicao ? "Editar tarefa" : "Criar tarefa"}
        </div>

        <div className="formTarefa">
          <input
            className="inputTitulo"
            type="text"
            placeholder="Título da tarefa *"
            value={tarefa.titulo}
            onChange={(e) =>
              setTarefa({ ...tarefa, titulo: e.target.value })
            }
          />

          <input
            className="inputDescricao"
            type="text"
            placeholder="Descrição *"
            value={tarefa.descricao}
            onChange={(e) =>
              setTarefa({ ...tarefa, descricao: e.target.value })
            }
          />

          <select
            className="inputResponsavel"
            value={tarefa.responsavel}
            onChange={(e) =>
              setTarefa({ ...tarefa, responsavel: e.target.value })
            }
          >
            <option value="">Selecione um responsável *</option>

            {funcionarios.map((funcionario) => (
              <option key={funcionario.id} value={funcionario.id}>
                {funcionario.nome}
              </option>
            ))}
          </select>

          <input
            className="inputPrazo"
            type="date"
            value={tarefa.prazo}
            onChange={(e) =>
              setTarefa({ ...tarefa, prazo: e.target.value })
            }
          />

          <label className="checkTarefaFinalizada">
            <input
              type="checkbox"
              checked={Boolean(tarefa.finalizado)}
              onChange={(event) =>
                setTarefa({ ...tarefa, finalizado: event.target.checked })
              }
            />
            Finalizada
          </label>

          <button className="btnAdicionar" onClick={salvarTarefa}>
            {modoEdicao ? "Editar" : "Adicionar"}
          </button>

          {modoEdicao && (
            <button className="btnCancelar" onClick={limparFormulario}>
              Cancelar
            </button>
          )}
        </div>

        <table className="tabela">
          <thead>
            <tr className="tabelaHeader">
              <th className="th">Título</th>
              <th className="th">Descrição</th>
              <th className="th">Responsável</th>
              <th className="th">Prazo</th>
              <th className="th">Finalizada</th>
              <th className="th">Observação</th>
              <th className="th">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tarefas
              .filter((t) => {
                const termoBusca = busca.toLowerCase();
                return (
                  t.titulo.toLowerCase().includes(termoBusca) ||
                  t.descricao.toLowerCase().includes(termoBusca) ||
                  t.responsavel.toLowerCase().includes(termoBusca) ||
                  t.observacao.toLowerCase().includes(termoBusca) ||
                  t.finalizado.toString().includes(termoBusca)
                );
              })
              .map((tarefaAtual) => (
                <tr key={tarefaAtual.id} className="tabelaLinha">
                  <td className="td">{tarefaAtual.titulo}</td>
                  <td className="td">{tarefaAtual.descricao}</td>
                  <td className="td">{tarefaAtual.responsavel}</td>
                  <td className="td">{tarefaAtual.prazo}</td>
                  <td className="td">{tarefaAtual.finalizado ? "Sim" : "Não"}</td>
                  <td className="td tarefaObservacaoCell">
                    {tarefaAtual.observacao || "Sem observações"}
                  </td>
                  <td className="td">
                    <div className="acoes">
                      <button
                        className="btnEditar"
                        onClick={() => {
                          setModoEdicao(true);
                          setIdEdicao(tarefaAtual.id);
                          setTarefa({
                            titulo: tarefaAtual.titulo,
                            descricao: tarefaAtual.descricao,
                            responsavel: String(tarefaAtual.funcionario_id),
                            prazo: tarefaAtual.prazoInput,
                            finalizado: tarefaAtual.finalizado,
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btnExcluir"
                        onClick={() => excluirTarefa(tarefaAtual.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            {tarefas.length === 0 && (
              <tr className="tabelaLinha">
                <td className="td" colSpan={7} style={{ color: "#777" }}>
                  Nenhuma tarefa cadastrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

export default Tarefas;
