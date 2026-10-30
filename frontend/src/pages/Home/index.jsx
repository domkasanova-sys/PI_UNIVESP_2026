import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { formatarDataBR, formatarDiaSemana } from "../../utils/formatters";
import { getUsuarioLogado, isAdmin } from "../../utils/session";
import "./index.css";

function formatarHorario(valor) {
  return valor ? String(valor).slice(0, 5) : "--:--";
}

function VisaoGeral() {
  const usuarioLogado = getUsuarioLogado();
  const usuarioAdmin = isAdmin(usuarioLogado);
  const [funcionarios, setFuncionarios] = useState([]);
  const [funcionarioId, setFuncionarioId] = useState(usuarioAdmin ? "" : String(usuarioLogado?.id || ""));
  const [escala, setEscala] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [itensChecklist, setItensChecklist] = useState([]);
  const [carregandoChecklist, setCarregandoChecklist] = useState(true);
  const [erroChecklist, setErroChecklist] = useState("");
  const [carregandoFuncionarios, setCarregandoFuncionarios] = useState(usuarioAdmin);
  const [erroFuncionarios, setErroFuncionarios] = useState("");
  const [carregandoDados, setCarregandoDados] = useState(Boolean(!usuarioAdmin && usuarioLogado?.id));
  const [erroDados, setErroDados] = useState("");

  function trocarFuncionario(id) {
    setFuncionarioId(id);
    setEscala([]);
    setTarefas([]);
    setErroDados("");
    setCarregandoDados(Boolean(id));
  }

  useEffect(() => {
    let ativo = true;

    api.get("/checklist/dia")
      .then(({ data }) => {
        if (ativo) setItensChecklist(data);
      })
      .catch((error) => {
        if (ativo) {
          setErroChecklist(error.response?.data?.erro || "Não foi possível carregar o checklist de hoje.");
        }
      })
      .finally(() => {
        if (ativo) setCarregandoChecklist(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (!usuarioAdmin) return undefined;
    let ativo = true;

    api.get("/funcionarios")
      .then(({ data }) => {
        if (ativo) setFuncionarios(data);
      })
      .catch((error) => {
        if (ativo) {
          setErroFuncionarios(error.response?.data?.error || "Não foi possível carregar os funcionários.");
        }
      })
      .finally(() => {
        if (ativo) setCarregandoFuncionarios(false);
      });

    return () => {
      ativo = false;
    };
  }, [usuarioAdmin]);

  useEffect(() => {
    if (!funcionarioId) return undefined;

    let ativo = true;

    const tarefasPromise = usuarioAdmin
      ? api.get("/tarefas/tarefas").then(({ data }) =>
          data.filter((tarefa) => String(tarefa.funcionario_id) === funcionarioId)
        )
      : api.get(`/tarefas/minhas/${funcionarioId}`).then(({ data }) => data);

    const escalaPromise = api.get(`/escalas/escalas/${funcionarioId}`)
      .then(({ data }) => data)
      .catch((error) => {
        if (error.response?.status === 404) return [];
        throw error;
      });

    Promise.all([tarefasPromise, escalaPromise])
      .then(([tarefasDoFuncionario, escalaDoFuncionario]) => {
        if (!ativo) return;

        setTarefas(tarefasDoFuncionario.map((tarefa) => ({
          id: tarefa.tarefa_id || tarefa.id,
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          prazo: formatarDataBR(tarefa.prazo) || "Sem prazo",
          finalizado: Boolean(tarefa.finalizado),
        })));
        setEscala([...escalaDoFuncionario]
          .sort((a, b) => Number(a.dia_semana) - Number(b.dia_semana))
          .map((item) => ({
            diaNumero: Number(item.dia_semana),
            dia: formatarDiaSemana(item.dia_semana),
            entrada: item.folga ? "Folga" : item.hora_inicio,
            saida: item.folga ? "Folga" : item.hora_fim,
            folga: item.folga,
          })));
      })
      .catch((error) => {
        if (ativo) {
          setErroDados(error.response?.data?.error || "Não foi possível carregar a escala e as tarefas.");
        }
      })
      .finally(() => {
        if (ativo) setCarregandoDados(false);
      });

    return () => {
      ativo = false;
    };
  }, [funcionarioId, usuarioAdmin]);

  const checklistConcluidos = itensChecklist.filter((item) => item.concluido);
  const percentualChecklist = itensChecklist.length
    ? Math.round((checklistConcluidos.length / itensChecklist.length) * 100)
    : 0;
  const tarefasPendentes = tarefas.filter((tarefa) => !tarefa.finalizado).length;
  const diaHoje = new Date().getDay() || 7;
  const escalaHoje = escala.find((item) => item.diaNumero === diaHoje);
  const funcionarioSelecionado = funcionarios.find(
    (funcionario) => String(funcionario.id) === funcionarioId
  );
  const primeiroNome = usuarioLogado?.nome?.trim().split(/\s+/)[0] || "bem-vindo";
  const dataHoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const destinoTarefas = usuarioAdmin ? "/tarefas" : "/minhas-tarefas";
  const destinoEscala = usuarioAdmin ? "/escalas" : "/minha-escala";

  return (
    <Layout title="Visão geral" ativo="Visão geral">
      <div className="visaoContainer">
        <header className="visaoHeader">
          <div>
            <p className="visaoData">{dataHoje}</p>
            <h1>Olá, {primeiroNome}!</h1>
            <p className="visaoSubtitulo">
              {usuarioAdmin
                ? "Acompanhe a rotina e o andamento da equipe."
                : "Confira sua rotina e acompanhe o que precisa fazer."}
            </p>
          </div>
        </header>

        {usuarioAdmin && (
          <div className="visaoFiltro">
            <label htmlFor="visao-funcionario">Ver dados do funcionário</label>
            <select
              id="visao-funcionario"
              className="selectFuncionario"
              value={funcionarioId}
              onChange={(event) => trocarFuncionario(event.target.value)}
              disabled={carregandoFuncionarios}
            >
              <option value="">
                {carregandoFuncionarios ? "Carregando funcionários..." : "Selecione um funcionário"}
              </option>
              {funcionarios.map((funcionario) => (
                <option key={funcionario.id} value={funcionario.id}>
                  {funcionario.nome}{funcionario.cargo ? ` · ${funcionario.cargo}` : ""}
                </option>
              ))}
            </select>
            {erroFuncionarios && <p className="visaoErro" role="alert">{erroFuncionarios}</p>}
          </div>
        )}

        <section className="visaoIndicadores" aria-label="Resumo do dia">
          <article className="visaoIndicador">
            <span className="visaoIndicadorIcone indicadorAzul" aria-hidden="true">✓</span>
            <div>
              <p>Checklist concluído</p>
              <strong>
                {carregandoChecklist ? "—" : `${checklistConcluidos.length} / ${itensChecklist.length}`}
              </strong>
              <span>{carregandoChecklist ? "Carregando..." : `${percentualChecklist}% dos itens de hoje`}</span>
            </div>
          </article>

          <article className="visaoIndicador">
            <span className="visaoIndicadorIcone indicadorLaranja" aria-hidden="true">◷</span>
            <div>
              <p>Tarefas pendentes</p>
              <strong>{funcionarioId ? (carregandoDados ? "—" : tarefasPendentes) : "—"}</strong>
              <span>{funcionarioId ? "para este funcionário" : "selecione um funcionário"}</span>
            </div>
          </article>

          <article className="visaoIndicador">
            <span className="visaoIndicadorIcone indicadorVerde" aria-hidden="true">
              {usuarioAdmin ? "♙" : "▦"}
            </span>
            <div>
              <p>{usuarioAdmin ? "Funcionários" : "Escala de hoje"}</p>
              <strong>
                {usuarioAdmin
                  ? carregandoFuncionarios ? "—" : funcionarios.length
                  : !funcionarioId || carregandoDados ? "—" : escalaHoje?.folga ? "Folga" : escalaHoje ? `${formatarHorario(escalaHoje.entrada)} – ${formatarHorario(escalaHoje.saida)}` : "Sem escala"}
              </strong>
              <span>{usuarioAdmin ? "na equipe" : "horário previsto"}</span>
            </div>
          </article>
        </section>

        <section className="visaoCard checklistResumoVisao" aria-labelledby="checklistResumoTitulo">
          <div className="visaoCardHeader checklistResumoHeader">
            <div>
              <h2 id="checklistResumoTitulo">Checklist de hoje</h2>
              <p>Atividades concluídas pela equipe</p>
            </div>
            {!carregandoChecklist && !erroChecklist && (
              <span className="checklistResumoContagem">
                {checklistConcluidos.length} de {itensChecklist.length}
              </span>
            )}
          </div>

          {!carregandoChecklist && !erroChecklist && itensChecklist.length > 0 && (
            <div
              className="checklistResumoProgresso"
              role="progressbar"
              aria-label="Progresso do checklist"
              aria-valuenow={percentualChecklist}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${percentualChecklist}%` }} />
            </div>
          )}

          {erroChecklist ? (
            <p className="visaoEstado visaoEstadoErro" role="alert">{erroChecklist}</p>
          ) : carregandoChecklist ? (
            <p className="visaoEstado">Carregando checklist de hoje...</p>
          ) : checklistConcluidos.length > 0 ? (
            <>
              <ul className="checklistResumoLista">
                {checklistConcluidos.slice(0, 3).map((item) => (
                  <li className="checklistResumoItem" key={item.item_id}>
                    <span className="checklistResumoMarcador" aria-hidden="true">✓</span>
                    <span className="checklistResumoDescricao">{item.descricao}</span>
                    {item.responsavel && (
                      <span className="checklistResumoResponsavel">{item.responsavel}</span>
                    )}
                  </li>
                ))}
              </ul>
              <Link className="visaoCardLink" to="/checklist">
                Ver checklist completo <span aria-hidden="true">→</span>
              </Link>
            </>
          ) : (
            <div className="visaoEstadoComLink">
              <p className="visaoEstado">Ainda não há itens concluídos hoje.</p>
              <Link className="visaoCardLink" to="/checklist">
                Abrir checklist <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </section>

        {erroDados && <p className="visaoErro" role="alert">{erroDados}</p>}

        {usuarioAdmin && !funcionarioId ? (
          <div className="visaoSelecaoVazia">
            <span aria-hidden="true">♙</span>
            <h2>Escolha um funcionário</h2>
            <p>Selecione alguém acima para visualizar a escala e as tarefas atribuídas.</p>
          </div>
        ) : (
          <div className="visaoDetalhesGrid">
            <section className="visaoCard">
              <div className="visaoCardHeader">
                <div>
                  <h2>{usuarioAdmin ? "Escala do funcionário" : "Minha escala"}</h2>
                  <p>{funcionarioSelecionado?.nome || "Seus próximos horários"}</p>
                </div>
                <Link className="visaoCardIconLink" to={destinoEscala} aria-label="Abrir escala">→</Link>
              </div>
              {carregandoDados ? (
                <p className="visaoEstado">Carregando escala...</p>
              ) : escala.length > 0 ? (
                <ul className="visaoLista">
                  {escala.slice(0, 3).map((item) => (
                    <li className="visaoEscalaItem" key={item.diaNumero}>
                      <span>{item.dia}</span>
                      <strong className={item.folga ? "visaoFolga" : ""}>
                        {item.folga ? "Folga" : `${formatarHorario(item.entrada)} — ${formatarHorario(item.saida)}`}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="visaoEstado">Nenhuma escala cadastrada.</p>
              )}
              <Link className="visaoCardLink" to={destinoEscala}>
                Ver escala completa <span aria-hidden="true">→</span>
              </Link>
            </section>

            <section className="visaoCard">
              <div className="visaoCardHeader">
                <div>
                  <h2>{usuarioAdmin ? "Tarefas do funcionário" : "Minhas tarefas"}</h2>
                  <p>{funcionarioSelecionado?.nome || "Acompanhe seus prazos"}</p>
                </div>
                <Link className="visaoCardIconLink" to={destinoTarefas} aria-label="Abrir tarefas">→</Link>
              </div>
              {carregandoDados ? (
                <p className="visaoEstado">Carregando tarefas...</p>
              ) : tarefas.length > 0 ? (
                <ul className="visaoLista">
                  {tarefas.slice(0, 4).map((tarefa) => (
                    <li className="visaoTarefaItem" key={tarefa.id}>
                      <span className={`visaoTarefaMarcador${tarefa.finalizado ? " tarefaFeita" : ""}`} aria-hidden="true" />
                      <span className="visaoTarefaTexto">
                        <strong>{tarefa.titulo}</strong>
                        <small>Prazo: {tarefa.prazo}</small>
                      </span>
                      <span className={`visaoTarefaStatus${tarefa.finalizado ? " statusFeito" : ""}`}>
                        {tarefa.finalizado ? "Concluída" : "Pendente"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="visaoEstado">Nenhuma tarefa atribuída.</p>
              )}
              <Link className="visaoCardLink" to={destinoTarefas}>
                {usuarioAdmin ? "Ir para gestão de tarefas" : "Ver minhas tarefas"}
                <span aria-hidden="true">→</span>
              </Link>
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default VisaoGeral;
