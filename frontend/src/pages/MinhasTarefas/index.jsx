import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../services/api";
import { getUsuarioLogado } from "../../utils/session";
import { formatarDataBR } from "../../utils/formatters";
import "./index.css";

function MinhasTarefas() {
  const usuario = getUsuarioLogado();
  const [tarefas, setTarefas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    let ativo = true;

    Promise.resolve()
      .then(() => {
        if (!usuario?.id) {
          throw new Error("Não foi possível identificar o usuário conectado.");
        }

        return api.get(`/tarefas/minhas/${usuario.id}`);
      })
      .then(({ data }) => {
        if (ativo) setTarefas(data.map((tarefa) => ({
          ...tarefa,
          finalizado: Boolean(tarefa.finalizado),
          observacao: tarefa.observacao || "",
        })));
      })
      .catch((errorDaApi) => {
        if (ativo) {
          setErro(errorDaApi.response?.data?.error || "Não foi possível carregar suas tarefas.");
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [usuario?.id]);

  function atualizarObservacao(tarefaId, observacao) {
    setTarefas((tarefasAtuais) => tarefasAtuais.map((tarefa) =>
      tarefa.tarefa_id === tarefaId ? { ...tarefa, observacao } : tarefa
    ));
    setMensagem("");
  }

  async function salvarAtualizacao(tarefa, concluir = false) {
    setSalvandoId(tarefa.tarefa_id);
    setErro("");
    setMensagem("");

    try {
      const { data } = await api.patch(`/tarefas/tarefas/${tarefa.tarefa_id}/execucao`, {
        funcionario_id: usuario.id,
        observacao: tarefa.observacao,
        finalizado: concluir,
      });

      setTarefas((tarefasAtuais) => tarefasAtuais.map((tarefaAtual) =>
        tarefaAtual.tarefa_id === data.tarefa_id
          ? { ...tarefaAtual, ...data, finalizado: Boolean(data.finalizado), observacao: data.observacao || "" }
          : tarefaAtual
      ));
      setMensagem(concluir ? "Tarefa concluída e observação salva." : "Observação salva.");
    } catch (errorDaApi) {
      setErro(errorDaApi.response?.data?.error || "Não foi possível salvar as alterações.");
    } finally {
      setSalvandoId(null);
    }
  }

  const concluidas = tarefas.filter((tarefa) => tarefa.finalizado).length;

  return (
    <Layout title="Minhas tarefas" ativo="Minhas tarefas">
      <section className="minhasTarefasPage">
        <header className="minhasTarefasHeader">
          <p className="minhasTarefasEyebrow">ROTINA DE TRABALHO</p>
          <h1>Minhas tarefas</h1>
          <p>Acompanhe suas tarefas, registre observações e marque as concluídas.</p>
        </header>

        {!carregando && !erro && tarefas.length > 0 && (
          <p className="minhasTarefasResumo" aria-live="polite">
            {concluidas} de {tarefas.length} concluídas
          </p>
        )}

        {erro && <p className="minhasTarefasErro" role="alert">{erro}</p>}
        {mensagem && <p className="minhasTarefasSucesso" role="status">{mensagem}</p>}

        {carregando ? (
          <p className="minhasTarefasEstado">Carregando suas tarefas...</p>
        ) : !erro && tarefas.length === 0 ? (
          <p className="minhasTarefasEstado">Você não tem tarefas atribuídas no momento.</p>
        ) : (
          <div className="minhasTarefasLista">
            {tarefas.map((tarefa) => (
              <article className={`minhaTarefa${tarefa.finalizado ? " tarefaConcluida" : ""}`} key={tarefa.tarefa_id}>
                <div className="minhaTarefaTopo">
                  <div>
                    <h2>{tarefa.titulo}</h2>
                    <p className="minhaTarefaDescricao">{tarefa.descricao}</p>
                  </div>
                  <span className={`minhaTarefaStatus${tarefa.finalizado ? " statusConcluido" : ""}`}>
                    {tarefa.finalizado ? "Concluída" : "Pendente"}
                  </span>
                </div>

                <p className="minhaTarefaPrazo">
                  Prazo: {tarefa.prazo ? formatarDataBR(tarefa.prazo) : "Não informado"}
                </p>

                <label className="minhaTarefaLabel" htmlFor={`observacao-${tarefa.tarefa_id}`}>
                  Observação
                </label>
                <textarea
                  id={`observacao-${tarefa.tarefa_id}`}
                  className="minhaTarefaObservacao"
                  value={tarefa.observacao}
                  maxLength={2000}
                  placeholder="Registre um comentário sobre esta tarefa"
                  onChange={(event) => atualizarObservacao(tarefa.tarefa_id, event.target.value)}
                  disabled={salvandoId === tarefa.tarefa_id}
                />
                <span className="minhaTarefaContagem">{tarefa.observacao.length}/2000</span>

                <div className="minhaTarefaAcoes">
                  <button
                    type="button"
                    className="minhaTarefaBotaoSecundario"
                    onClick={() => salvarAtualizacao(tarefa)}
                    disabled={salvandoId === tarefa.tarefa_id}
                  >
                    Salvar observação
                  </button>
                  {!tarefa.finalizado && (
                    <button
                      type="button"
                      className="minhaTarefaBotaoConcluir"
                      onClick={() => salvarAtualizacao(tarefa, true)}
                      disabled={salvandoId === tarefa.tarefa_id}
                    >
                      {salvandoId === tarefa.tarefa_id ? "Salvando..." : "Concluir tarefa"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

export default MinhasTarefas;