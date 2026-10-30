import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { formatarDataBR, formatarDiaSemana } from "../../utils/formatters";
import { getUsuarioLogado, isAdmin } from "../../utils/session";
import "./index.css";

function VisaoGeral() {
  const usuarioLogado = getUsuarioLogado();
  const usuarioAdmin = isAdmin(usuarioLogado);
  const [funcionarios, setFuncionarios] = useState([]);
  const [funcionarioId, setFuncionarioId] = useState(usuarioAdmin ? "" : usuarioLogado?.id || "");
  const [escala, setEscala] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [itensChecklistConcluidos, setItensChecklistConcluidos] = useState([]);
  const [carregandoChecklist, setCarregandoChecklist] = useState(true);
  const [erroChecklist, setErroChecklist] = useState("");
  const [mostrarTudo, setMostrarTudo] = useState(false);

  function formatarEscalas(escalas) {
    return [...escalas]
      .sort((a, b) => Number(a.dia_semana) - Number(b.dia_semana))
      .map((item) => ({
        dia: formatarDiaSemana(item.dia_semana),
        entrada: item.folga ? "Folga" : item.hora_inicio,
        saida: item.folga ? "Folga" : item.hora_fim,
        folga: item.folga,
      }));
  }

  async function carregarDadosFuncionario(id) {
    try {
      const respostaTarefas = await api.get("/tarefas/tarefas");

      const tarefasDoFuncionario = respostaTarefas.data
        .filter((tarefa) => String(tarefa.funcionario_id) === String(id))
        .map((tarefa) => ({
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          prazo: formatarDataBR(tarefa.prazo),
        }));

      setTarefas(tarefasDoFuncionario);

      try {
        const respostaEscala = await api.get(`/escalas/escalas/${id}`);

        const escalaFormatada = formatarEscalas(respostaEscala.data);

        setEscala(escalaFormatada);
      } catch {
        setEscala([]);
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao carregar dados do funcionário.");
    }
  }

  function trocarFuncionario(id) {
    setFuncionarioId(id);
    setMostrarTudo(false);

    if (id) {
      carregarDadosFuncionario(id);
    } else {
      setEscala([]);
      setTarefas([]);
    }
  }

  useEffect(() => {
    let ativo = true;

    api.get("/checklist/dia")
      .then(({ data }) => {
        if (ativo) {
          setItensChecklistConcluidos(data.filter((item) => item.concluido));
        }
      })
      .catch((error) => {
        if (ativo) {
          setErroChecklist(error.response?.data?.erro || "Não foi possível carregar os itens concluídos do checklist.");
        }
      })
      .finally(() => {
        if (ativo) setCarregandoChecklist(false);
      });

    if (usuarioAdmin) {
      api.get("/funcionarios").then((resposta) => {
        if (ativo) {
          setFuncionarios(resposta.data);
        }
      });
    } else if (usuarioLogado?.id) {
      Promise.all([
        api.get("/tarefas/tarefas"),
        api.get(`/escalas/escalas/${usuarioLogado.id}`).catch(() => ({ data: [] })),
      ]).then(([respostaTarefas, respostaEscala]) => {
        if (!ativo) return;

        const tarefasDoFuncionario = respostaTarefas.data
          .filter((tarefa) => String(tarefa.funcionario_id) === String(usuarioLogado.id))
          .map((tarefa) => ({
            titulo: tarefa.titulo,
            descricao: tarefa.descricao,
            prazo: formatarDataBR(tarefa.prazo),
          }));

        const escalaFormatada = formatarEscalas(respostaEscala.data);

        setTarefas(tarefasDoFuncionario);
        setEscala(escalaFormatada);
      });
    }

    return () => {
      ativo = false;
    };
  }, [usuarioAdmin, usuarioLogado?.id]);

  const escalaVisivel = mostrarTudo ? escala : escala.slice(0, 3);

  return (
    <Layout
      title="Visão Geral"
      ativo="Visão geral"
    >
      <div className="visaoContainer">
        {usuarioAdmin && (
          <select
            className="selectFuncionario"
            value={funcionarioId}
            onChange={(e) => trocarFuncionario(e.target.value)}
          >
            <option value="">Selecione um funcionário</option>

            {funcionarios.map((funcionario) => (
              <option key={funcionario.id} value={funcionario.id}>
                {funcionario.nome.toUpperCase()} ({funcionario.cargo.toUpperCase()})
              </option>
            ))}
          </select>
        )}

        <section className="checklistResumoVisao" aria-labelledby="checklistResumoTitulo">
          <div className="checklistResumoHeader">
            <div>
              <h2 id="checklistResumoTitulo" className="secaoTitulo">Checklist concluído hoje</h2>
              <p>Itens da rotina já finalizados pela equipe.</p>
            </div>
            {!carregandoChecklist && !erroChecklist && (
              <span className="checklistResumoContagem">
                {itensChecklistConcluidos.length} concluído{itensChecklistConcluidos.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {erroChecklist ? (
            <p className="checklistResumoMensagem checklistResumoErro" role="alert">{erroChecklist}</p>
          ) : carregandoChecklist ? (
            <p className="checklistResumoMensagem">Carregando checklist de hoje...</p>
          ) : itensChecklistConcluidos.length > 0 ? (
            <ul className="checklistResumoLista">
              {itensChecklistConcluidos.map((item) => (
                <li className="checklistResumoItem" key={item.item_id}>
                  <span className="checklistResumoMarcador" aria-hidden="true">✓</span>
                  <span className="checklistResumoDescricao">{item.descricao}</span>
                  {item.responsavel && (
                    <span className="checklistResumoResponsavel">{item.responsavel}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="checklistResumoMensagem">Nenhum item foi concluído hoje.</p>
          )}
        </section>

        {(funcionarioId || !usuarioAdmin) && (
          <>
            <h2 className="secaoTitulo">Escala de trabalho</h2>

            <div className="escalaLista">
              {escalaVisivel.length > 0 ? (
                escalaVisivel.map((item) => (
                  <div className="linhaEscala" key={item.dia}>
                    <label>{item.dia}</label>
                    <div className="campoHorario">
                      <span>Entrada</span>
                      <input value={item.entrada || ""} readOnly />
                    </div>
                    <div className="campoHorario">
                      <span>Saída</span>
                      <input value={item.saida || ""} readOnly />
                    </div>

                    <div className="folgaBox">
                      <input type="checkbox" checked={!!item.folga} readOnly />
                      <span>Folga</span>
                    </div>
                  </div>
                ))
              ) : (
                <p>Nenhuma escala cadastrada para este funcionário.</p>
              )}
            </div>

            {escala.length > 3 && (
              <button
                className="verMaisBtn"
                onClick={() => setMostrarTudo(!mostrarTudo)}
              >
                {mostrarTudo ? "Ver menos" : "Ver mais"}
              </button>
            )}

            <h2 className="secaoTitulo tarefasTitulo">Tarefas</h2>

            <div className="tabelaVisao">
              <div className="tabelaVisaoHeader">
                <div>Título</div>
                <div>Descrição</div>
                <div>Prazo</div>
              </div>

              {tarefas.length > 0 ? (
                tarefas.map((tarefa, index) => (
                  <div className="tabelaVisaoLinha" key={index}>
                    <div>{tarefa.titulo}</div>
                    <div>{tarefa.descricao}</div>
                    <div>{tarefa.prazo}</div>
                  </div>
                ))
              ) : (
                <div className="tabelaVisaoLinha">
                  <div>Nenhuma tarefa</div>
                  <div>Sem tarefas cadastradas</div>
                  <div>-</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default VisaoGeral;
