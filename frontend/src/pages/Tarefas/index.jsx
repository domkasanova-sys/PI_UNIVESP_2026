import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { formatarDataBR } from "../../utils/formatters";
import "./index.css";

function Tarefas() {
  const [modoEdicao, setModoEdicao] = useState(false);
  const [idEdicao, setIdEdicao] = useState(null);
  const [busca, setBusca] = useState("");
  const [baixandoRelatorio, setBaixandoRelatorio] = useState(false);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [relatorio, setRelatorio] = useState(null);
  const [erroRelatorio, setErroRelatorio] = useState("");
  const [periodoRelatorio, setPeriodoRelatorio] = useState(() => {
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return { inicio: hoje, fim: hoje };
  });

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

  async function baixarRelatorio() {
    try {
      setBaixandoRelatorio(true);
      const resposta = await api.get("/tarefas/relatorio/pdf", {
        params: periodoRelatorio,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([resposta.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-tarefas-checklist-${periodoRelatorio.inicio}-a-${periodoRelatorio.fim}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Erro ao baixar o relatório em PDF.");
    } finally {
      setBaixandoRelatorio(false);
    }
  }

  async function visualizarRelatorio() {
    try {
      setCarregandoRelatorio(true);
      setErroRelatorio("");
      const { data } = await api.get("/tarefas/relatorio/dados", {
        params: periodoRelatorio,
      });
      setRelatorio(data);
    } catch (error) {
      setErroRelatorio(error.response?.data?.error || "Erro ao carregar tarefas do período.");
    } finally {
      setCarregandoRelatorio(false);
    }
  }

  return (

    <Layout title="Gestão - Tarefas" ativo="Gestão de Tarefas">
      <div className="containerTarefas">
        <div className="buscaTarefasContainer">
          <div className="buscaTarefasCabecalho">
            <div>
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
            <div className="relatorioTarefasControles">
              <label htmlFor="inicio-relatorio-tarefas">Período do relatório</label>
              <input
                id="inicio-relatorio-tarefas"
                type="date"
                aria-label="Início do período do relatório"
                value={periodoRelatorio.inicio}
                onChange={(event) => {
                  setRelatorio(null);
                  setPeriodoRelatorio((periodo) => ({
                    ...periodo,
                    inicio: event.target.value,
                  }));
                }}
              />
              <input
                type="date"
                aria-label="Fim do período do relatório"
                value={periodoRelatorio.fim}
                onChange={(event) => {
                  setRelatorio(null);
                  setPeriodoRelatorio((periodo) => ({
                    ...periodo,
                    fim: event.target.value,
                  }));
                }}
              />
              <button
                type="button"
                className="btnVisualizarRelatorio"
                onClick={visualizarRelatorio}
                disabled={
                  carregandoRelatorio ||
                  baixandoRelatorio ||
                  !periodoRelatorio.inicio ||
                  !periodoRelatorio.fim ||
                  periodoRelatorio.inicio > periodoRelatorio.fim
                }
              >
                {carregandoRelatorio ? "Carregando..." : "Visualizar na tela"}
              </button>
              <button
                type="button"
                className="btnRelatorio"
                onClick={baixarRelatorio}
                disabled={
                  baixandoRelatorio ||
                  !periodoRelatorio.inicio ||
                  !periodoRelatorio.fim ||
                  periodoRelatorio.inicio > periodoRelatorio.fim
                }
              >
                {baixandoRelatorio ? "Gerando PDF..." : "Baixar relatório PDF"}
              </button>
            </div>
          </div>
        </div>

        {erroRelatorio && <p className="erroRelatorio" role="alert">{erroRelatorio}</p>}

        {relatorio && (
          <section className="relatorioTarefasPainel" aria-labelledby="relatorioTarefasTitulo">
            <header className="relatorioTarefasResumo">
              <div>
                <p>RELATÓRIO DO PERÍODO</p>
                <h2 id="relatorioTarefasTitulo">Tarefas por prazo</h2>
                <span>
                  {formatarDataBR(relatorio.inicio)} a {formatarDataBR(relatorio.fim)}
                </span>
              </div>
              <div className="relatorioTarefasMetricas">
                <strong>{relatorio.total}</strong><span>no total</span>
                <strong>{relatorio.concluidas}</strong><span>concluídas</span>
                <strong>{relatorio.pendentes}</strong><span>pendentes</span>
              </div>
            </header>
            {relatorio.tarefas.length ? (
              <div className="relatorioTarefasLista">
                {relatorio.tarefas.map((item) => (
                  <article className="relatorioTarefaItem" key={item.tarefa_id}>
                    <div className="relatorioTarefaTopo">
                      <h3>{item.titulo || "Sem título"}</h3>
                      <span className={item.finalizado ? "tarefaRelatorioFeita" : "tarefaRelatorioPendente"}>
                        {item.finalizado ? "Concluída" : "Pendente"}
                      </span>
                    </div>
                    {item.descricao && <p>{item.descricao}</p>}
                    <div className="relatorioTarefaDetalhes">
                      <span>Responsável: {item.funcionario_nome || "Sem responsável"}</span>
                      <span>Prazo: {formatarDataBR(item.prazo)}</span>
                    </div>
                    {item.observacao && (
                      <p className="relatorioTarefaObservacao">Observação: {item.observacao}</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="relatorioTarefasVazio">Nenhuma tarefa com prazo neste período.</p>
            )}
          </section>
        )}

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
