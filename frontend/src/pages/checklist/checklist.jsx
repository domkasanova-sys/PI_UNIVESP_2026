import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { getUsuarioLogado, isAdmin } from "../../utils/session";
import "./checklist.css";

function obterResponsaveisSelecionados(itensDoDia, usuarioId) {
  return Object.fromEntries(
    itensDoDia.map((item) => [
      item.item_id,
      String(item.responsavel_id || usuarioId || ""),
    ])
  );
}

function obterDataBrasilia() {
  const partesData = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partesData.map(({ type, value }) => [type, value]));

  return `${valores.year}-${valores.month}-${valores.day}`;
}

function formatarDataRelatorio(data) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })
    .format(new Date(`${data}T12:00:00Z`));
}

function Checklist() {
  const usuario = getUsuarioLogado();
  const usuarioEhAdmin = isAdmin(usuario);
  const [itens, setItens] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [responsaveisSelecionados, setResponsaveisSelecionados] = useState({});
  const [novoItem, setNovoItem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [baixandoRelatorio, setBaixandoRelatorio] = useState(false);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [relatorio, setRelatorio] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [atualizandoItemId, setAtualizandoItemId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [periodoRelatorio, setPeriodoRelatorio] = useState(() => {
    const hoje = obterDataBrasilia();
    return { inicio: hoje, fim: hoje };
  });
  const [editandoItemId, setEditandoItemId] = useState(null);
  const [descricaoEdicao, setDescricaoEdicao] = useState("");

  const carregarChecklist = useCallback(async () => {
    try {
      setErro("");
      const { data } = await api.get("/checklist/dia");
      setItens(data);
      setResponsaveisSelecionados(obterResponsaveisSelecionados(data, usuario?.id));
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível carregar o checklist.");
    } finally {
      setCarregando(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    let ativo = true;

    Promise.all([api.get("/checklist/dia"), api.get("/funcionarios")])
      .then(([{ data: itensDoDia }, { data: listaFuncionarios }]) => {
        if (ativo) {
          setItens(itensDoDia);
          setFuncionarios(listaFuncionarios);
          setResponsaveisSelecionados(obterResponsaveisSelecionados(itensDoDia, usuario?.id));
        }
      })
      .catch((error) => {
        if (ativo) {
          setErro(error.response?.data?.erro || "Não foi possível carregar o checklist.");
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [usuario?.id]);

  useEffect(() => {
    let dataAtual = obterDataBrasilia();
    const intervalo = window.setInterval(() => {
      const novaData = obterDataBrasilia();
      if (novaData !== dataAtual) {
        dataAtual = novaData;
        carregarChecklist();
      }
    }, 30_000);

    return () => window.clearInterval(intervalo);
  }, [carregarChecklist]);

  async function gerarChecklist() {
    try {
      setGerando(true);
      setErro("");
      setMensagem("");
      await api.post("/checklist/gerar-dia");
      await carregarChecklist();
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível gerar o checklist de hoje.");
    } finally {
      setGerando(false);
    }
  }

  async function reiniciarChecklist() {
    if (!window.confirm("Deseja reiniciar o checklist de hoje? Todos os itens concluídos voltarão para pendente.")) {
      return;
    }

    try {
      setReiniciando(true);
      setErro("");
      setMensagem("");
      const { data } = await api.post("/checklist/reiniciar-dia", {
        funcionario_id: usuario.id,
      });
      await carregarChecklist();
      setMensagem(`${data.quantidade_reiniciada} item(ns) voltaram para pendente.`);
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível reiniciar o checklist de hoje.");
    } finally {
      setReiniciando(false);
    }
  }

  async function baixarRelatorio() {
    try {
      setBaixandoRelatorio(true);
      setErro("");
      setMensagem("");
      const resposta = await api.get("/checklist/relatorio/pdf", {
        params: periodoRelatorio,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([resposta.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-checklist-${periodoRelatorio.inicio}-a-${periodoRelatorio.fim}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível baixar o relatório do checklist.");
    } finally {
      setBaixandoRelatorio(false);
    }
  }

  async function visualizarRelatorio() {
    try {
      setCarregandoRelatorio(true);
      setErro("");
      setMensagem("");
      const { data } = await api.get("/checklist/relatorio/dados", {
        params: periodoRelatorio,
      });
      setRelatorio(data);
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível carregar o relatório do checklist.");
    } finally {
      setCarregandoRelatorio(false);
    }
  }

  async function adicionarItem(event) {
    event.preventDefault();
    const descricao = novoItem.trim();
    if (!descricao) return;

    try {
      setSalvando(true);
      setErro("");
      await api.post("/checklist/itens", { descricao });
      setNovoItem("");
      await api.post("/checklist/gerar-dia");
      await carregarChecklist();
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível adicionar o item.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(item) {
    setEditandoItemId(item.item_id);
    setDescricaoEdicao(item.descricao);
    setErro("");
    setMensagem("");
  }

  function cancelarEdicao() {
    setEditandoItemId(null);
    setDescricaoEdicao("");
  }

  async function salvarEdicao(itemId) {
    const descricao = descricaoEdicao.trim();
    if (!descricao) {
      setErro("A descrição do item é obrigatória.");
      return;
    }

    try {
      setAtualizandoItemId(itemId);
      setErro("");
      await api.put(`/checklist/itens/${itemId}`, { descricao });
      setItens((atuais) => atuais.map((item) =>
        item.item_id === itemId ? { ...item, descricao } : item
      ));
      cancelarEdicao();
      setMensagem("Item do checklist atualizado.");
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível editar o item.");
    } finally {
      setAtualizandoItemId(null);
    }
  }

  async function excluirItem(itemId) {
    if (!window.confirm("Deseja remover este item da lista de checklist?")) return;

    try {
      setAtualizandoItemId(itemId);
      setErro("");
      await api.delete(`/checklist/itens/${itemId}`);
      setItens((atuais) => atuais.filter((item) => item.item_id !== itemId));
      cancelarEdicao();
      setMensagem("Item removido da lista de checklist.");
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível remover o item.");
    } finally {
      setAtualizandoItemId(null);
    }
  }

  async function moverItem(itemId, direcao) {
    try {
      setAtualizandoItemId(itemId);
      setErro("");
      setMensagem("");
      const { data } = await api.put(`/checklist/itens/${itemId}/mover`, { direcao });
      const idsOrdenados = data.itens.map((item) => Number(item.item_id));
      setItens((atuais) => {
        const itensPorId = new Map(atuais.map((item) => [Number(item.item_id), item]));
        return idsOrdenados.map((id) => itensPorId.get(id)).filter(Boolean);
      });
      setMensagem("Ordem do checklist atualizada.");
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível reorganizar o checklist.");
    } finally {
      setAtualizandoItemId(null);
    }
  }

  async function alterarConclusao(itemId, concluido) {
    const funcionarioId = responsaveisSelecionados[itemId];
    if (concluido && !funcionarioId) {
      setErro("Selecione o responsável pela execução antes de concluir o item.");
      return;
    }

    const funcionarioResponsavel = Number(funcionarioId || usuario?.id || 0);
    if (concluido && !funcionarioResponsavel) {
      setErro("Selecione o responsável pela execução antes de concluir o item.");
      return;
    }

    const itensAnteriores = itens;
    setItens((atuais) => atuais.map((item) =>
      item.item_id === itemId ? { ...item, concluido } : item
    ));
    setAtualizandoItemId(itemId);

    try {
      setErro("");
      const { data } = await api.put("/checklist/concluir", {
        item_id: itemId,
        funcionario_id: funcionarioResponsavel,
        concluido,
      });

      const responsavel = funcionarios.find(
        (funcionario) => Number(funcionario.id) === Number(data.responsavel_id)
      );
      setItens((atuais) => atuais.map((item) =>
        item.item_id === itemId
          ? {
              ...item,
              concluido: data.concluido,
              responsavel_id: data.responsavel_id,
              responsavel: responsavel?.nome || item.responsavel,
            }
          : item
      ));
    } catch (error) {
      setItens(itensAnteriores);
      setErro(error.response?.data?.erro || "Não foi possível atualizar este item.");
    } finally {
      setAtualizandoItemId(null);
    }
  }

  const concluidos = itens.filter((item) => item.concluido).length;
  const pendentes = itens.length - concluidos;

  return (
    <Layout title="Checklist Diário" ativo="Checklist">
      <section className="checklistPage">
        <header className="checklistHeader">
          <div>
            <p className="checklistEyebrow">ROTINA DA EQUIPE</p>
            <h1>Checklist diário</h1>
            <p className="checklistDate">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
              })}
            </p>
            <p className="checklistAutoResetInfo">
              A lista é renovada automaticamente à meia-noite (horário de Brasília).
            </p>
          </div>
          <div className="checklistHeaderActions">
            {usuarioEhAdmin && (
              <>
                <button
                  className="checklistButton checklistButtonDanger"
                  type="button"
                  onClick={reiniciarChecklist}
                  disabled={reiniciando || gerando || baixandoRelatorio}
                >
                  {reiniciando ? "Reiniciando..." : "Reiniciar checklist"}
                </button>
                <div className="checklistReportControls">
                  <div className="checklistDateRange">
                    <input
                      className="checklistDateInput"
                      type="date"
                      aria-label="Início do período do relatório"
                      value={periodoRelatorio.inicio}
                      onChange={(event) => setPeriodoRelatorio((periodo) => ({
                        ...periodo,
                        inicio: event.target.value,
                      }))}
                    />
                    <input
                      className="checklistDateInput"
                      type="date"
                      aria-label="Fim do período do relatório"
                      value={periodoRelatorio.fim}
                      onChange={(event) => setPeriodoRelatorio((periodo) => ({
                        ...periodo,
                        fim: event.target.value,
                      }))}
                    />
                  </div>
                  <div className="checklistReportButtons">
                    <button
                      className="checklistButton checklistButtonSecondary"
                      type="button"
                      onClick={visualizarRelatorio}
                      disabled={
                        carregandoRelatorio ||
                        baixandoRelatorio ||
                        !periodoRelatorio.inicio ||
                        !periodoRelatorio.fim ||
                        periodoRelatorio.inicio > periodoRelatorio.fim
                      }
                    >
                      {carregandoRelatorio ? "Carregando..." : "Visualizar relatório"}
                    </button>
                    <button
                      className="checklistButton checklistButtonReport"
                      type="button"
                      onClick={baixarRelatorio}
                      disabled={
                        baixandoRelatorio ||
                        reiniciando ||
                        gerando ||
                        !periodoRelatorio.inicio ||
                        !periodoRelatorio.fim ||
                        periodoRelatorio.inicio > periodoRelatorio.fim
                      }
                    >
                      {baixandoRelatorio ? "Gerando PDF..." : "Baixar relatório PDF"}
                    </button>
                  </div>
                </div>
              </>
            )}
            <button
              className="checklistButton checklistButtonSecondary"
              type="button"
              onClick={gerarChecklist}
              disabled={gerando || reiniciando}
            >
              {gerando ? "Gerando..." : "↻ Gerar checklist de hoje"}
            </button>
          </div>
        </header>

        <div className="checklistSummary" aria-live="polite">
          <strong>{concluidos} concluídos</strong>
          <span>{pendentes} pendentes · {itens.length} itens na lista de hoje</span>
          <div className="checklistProgress" aria-label={`${itens.length ? Math.round((concluidos / itens.length) * 100) : 0}% concluído`}>
            <span style={{ width: `${itens.length ? (concluidos / itens.length) * 100 : 0}%` }} />
          </div>
        </div>

        {relatorio && (
          <section className="checklistReport" aria-labelledby="checklistReportTitle">
            <header className="checklistReportHeader">
              <div>
                <p className="checklistEyebrow">RELATÓRIO DO PERÍODO</p>
                <h2 id="checklistReportTitle">Execuções por item e funcionário</h2>
                <p>
                  {relatorio.inicio === relatorio.fim
                    ? formatarDataRelatorio(relatorio.inicio)
                    : `${formatarDataRelatorio(relatorio.inicio)} a ${formatarDataRelatorio(relatorio.fim)}`}
                </p>
              </div>
              <div className="checklistReportTotals">
                <strong>{relatorio.total_concluidos}</strong>
                <span>conclusões</span>
                <strong>{relatorio.total_ocorrencias}</strong>
                <span>ocorrências</span>
              </div>
            </header>
            {relatorio.itens.length ? (
              <div className="checklistReportList">
                {relatorio.itens.map((item) => (
                  <article className="checklistReportItem" key={item.item_id}>
                    <div className="checklistReportItemHeading">
                      <h3>{item.descricao}</h3>
                      <span>{item.concluidos} concluídos de {item.ocorrencias} ocorrências</span>
                    </div>
                    {item.funcionarios.length ? (
                      <ul>
                        {item.funcionarios.map((funcionario) => (
                          <li key={`${item.item_id}-${funcionario.nome}`}>
                            <span>{funcionario.nome}</span>
                            <strong>{funcionario.quantidade} vez(es)</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="checklistReportNoCompletions">
                        Nenhuma conclusão registrada no período.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="checklistReportNoCompletions">
                Nenhum item encontrado no período selecionado.
              </p>
            )}
          </section>
        )}

        {usuarioEhAdmin && (
          <form className="checklistAddForm" onSubmit={adicionarItem}>
            <label className="checklistFormLabel" htmlFor="novo-checklist-item">
              Adicionar item à rotina
            </label>
            <div className="checklistFormRow">
              <input
                id="novo-checklist-item"
                className="checklistInput"
                type="text"
                value={novoItem}
                onChange={(event) => setNovoItem(event.target.value)}
                placeholder="Ex.: higienizar as bancadas"
                maxLength={300}
              />
              <button
                className="checklistButton checklistButtonPrimary"
                type="submit"
                disabled={salvando || !novoItem.trim()}
              >
                {salvando ? "Adicionando..." : "＋ Adicionar item"}
              </button>
            </div>
          </form>
        )}

        {erro && <p className="checklistError" role="alert">{erro}</p>}
        {mensagem && <p className="checklistSuccess" role="status">{mensagem}</p>}

        <section className="checklistItems" aria-label="Itens do checklist de hoje">
          {carregando ? (
            <p className="checklistEmpty">Carregando checklist...</p>
          ) : itens.length ? (
            itens.map((item, indice) => (
              <div
                className={`checklistItem${item.concluido ? " isDone" : ""}`}
                key={item.item_id}
              >
                <input
                  type="checkbox"
                  aria-label={`Marcar ${item.descricao} como concluído`}
                  checked={Boolean(item.concluido)}
                  disabled={Boolean(item.concluido) || !responsaveisSelecionados[item.item_id] || atualizandoItemId === item.item_id}
                  onChange={() => alterarConclusao(item.item_id, true)}
                />
                <div className="checklistItemMain">
                  {usuarioEhAdmin && editandoItemId === item.item_id ? (
                    <input
                      className="checklistEditInput"
                      value={descricaoEdicao}
                      maxLength={300}
                      disabled={atualizandoItemId === item.item_id}
                      onChange={(event) => setDescricaoEdicao(event.target.value)}
                      aria-label={`Editar ${item.descricao}`}
                    />
                  ) : (
                    <span className="checklistItemText">{item.descricao}</span>
                  )}
                  {usuarioEhAdmin && editandoItemId !== item.item_id && (
                    <div className="checklistOrderActions" aria-label={`Ordenar ${item.descricao}`}>
                      <button
                        type="button"
                        aria-label={`Mover ${item.descricao} para cima`}
                        title="Mover para cima"
                        disabled={indice === 0 || atualizandoItemId !== null}
                        onClick={() => moverItem(item.item_id, "cima")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Mover ${item.descricao} para baixo`}
                        title="Mover para baixo"
                        disabled={indice === itens.length - 1 || atualizandoItemId !== null}
                        onClick={() => moverItem(item.item_id, "baixo")}
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>
                <div className="checklistAssignment">
                  {usuarioEhAdmin ? (
                    <select
                      className="checklistResponsibleSelect"
                      aria-label={`Responsável por ${item.descricao}`}
                      value={responsaveisSelecionados[item.item_id] || ""}
                      disabled={Boolean(item.concluido)}
                      onChange={(event) => setResponsaveisSelecionados((atuais) => ({
                        ...atuais,
                        [item.item_id]: event.target.value,
                      }))}
                    >
                      <option value="">Selecionar responsável</option>
                      {funcionarios.map((funcionario) => (
                        <option key={funcionario.id} value={funcionario.id}>
                          {funcionario.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="checklistResponsible">
                      {item.concluido
                        ? `Concluído por ${item.responsavel || usuario?.nome || "você"}`
                        : `Concluir como ${usuario?.nome || "usuário conectado"}`}
                    </span>
                  )}
                  <span className={`checklistStatus${item.concluido ? " statusDone" : ""}`}>
                    {item.concluido ? "Concluído" : "Pendente"}
                  </span>
                  {usuarioEhAdmin && (
                    <div className="checklistItemActions">
                      {editandoItemId === item.item_id ? (
                        <>
                          <button
                            type="button"
                            className="checklistActionButton checklistActionSave"
                            onClick={() => salvarEdicao(item.item_id)}
                            disabled={atualizandoItemId === item.item_id}
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="checklistActionButton"
                            onClick={cancelarEdicao}
                            disabled={atualizandoItemId === item.item_id}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="checklistActionButton"
                            onClick={() => iniciarEdicao(item)}
                            disabled={atualizandoItemId === item.item_id}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="checklistActionButton checklistActionDelete"
                            onClick={() => excluirItem(item.item_id)}
                            disabled={atualizandoItemId === item.item_id}
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="checklistEmptyState">
              <span aria-hidden="true">☑</span>
              <h2>Nenhum item para hoje</h2>
              <p>Gere o checklist diário para carregar os itens ativos da rotina.</p>
              <button
                className="checklistButton checklistButtonPrimary"
                type="button"
                onClick={gerarChecklist}
                disabled={gerando}
              >
                {gerando ? "Gerando..." : "Gerar checklist de hoje"}
              </button>
            </div>
          )}
        </section>
      </section>
    </Layout>
  );
}

export default Checklist;