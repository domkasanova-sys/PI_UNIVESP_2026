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
  const [salvando, setSalvando] = useState(false);
  const [atualizandoItemId, setAtualizandoItemId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

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
              <button
                className="checklistButton checklistButtonDanger"
                type="button"
                onClick={reiniciarChecklist}
                disabled={reiniciando || gerando}
              >
                {reiniciando ? "Reiniciando..." : "Reiniciar checklist"}
              </button>
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

        {erro && <p className="checklistError" role="alert">{erro}</p>}
        {mensagem && <p className="checklistSuccess" role="status">{mensagem}</p>}

        <section className="checklistItems" aria-label="Itens do checklist de hoje">
          {carregando ? (
            <p className="checklistEmpty">Carregando checklist...</p>
          ) : itens.length ? (
            itens.map((item) => (
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
                <span className="checklistItemText">{item.descricao}</span>
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