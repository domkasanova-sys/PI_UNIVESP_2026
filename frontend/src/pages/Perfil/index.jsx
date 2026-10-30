import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../../components/Header";
import api from "../../services/api";
import avatar from "../../assets/avatar.png";
import { getUsuarioLogado, limparUsuarioLogado, setUsuarioLogado } from "../../utils/session";
import { getProfilePhotoUrl } from "../../utils/profilePhoto";
import "./index.css";

const tamanhoMaximoFoto = 768 * 1024;
const tamanhoMaximoArquivo = 10 * 1024 * 1024;

async function prepararFoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma imagem JPEG, PNG ou WebP.");
  }

  if (file.size > tamanhoMaximoArquivo) {
    throw new Error("A imagem original deve ter no máximo 10 MB.");
  }

  const imagem = await createImageBitmap(file);
  const escala = Math.min(1, 512 / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(imagem.width * escala));
  canvas.height = Math.max(1, Math.round(imagem.height * escala));
  const contexto = canvas.getContext("2d");

  if (!contexto) {
    imagem.close();
    throw new Error("Não foi possível preparar esta imagem.");
  }

  contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) {
    throw new Error("Não foi possível converter esta imagem.");
  }

  if (blob.size > tamanhoMaximoFoto) {
    throw new Error("A imagem ficou maior que 768 KB após a conversão.");
  }

  return blob;
}

function VerPerfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const inputFoto = useRef(null);
  const usuarioLogado = getUsuarioLogado();
  const idUsuarioLogado = usuarioLogado?.id;
  const [usuario, setUsuario] = useState(null);
  const [formulario, setFormulario] = useState({
    nome: "",
    username: "",
    cargo: "",
    senha: "",
  });
  const [erroFoto, setErroFoto] = useState("");
  const [mensagemFoto, setMensagemFoto] = useState("");
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [removendoFoto, setRemovendoFoto] = useState(false);

  useEffect(() => {
    let ativo = true;

    api.get("/funcionarios").then((resposta) => {
      if (!ativo) return;

      const idPerfil = id || idUsuarioLogado;
      const encontrado = resposta.data.find(
        (funcionario) => String(funcionario.id) === String(idPerfil)
      );
      const usuarioAtual = encontrado || getUsuarioLogado();

      setUsuario(usuarioAtual);
      setFormulario({
        nome: usuarioAtual?.nome || "",
        username: usuarioAtual?.username || "",
        cargo: usuarioAtual?.cargo || "",
        senha: "",
      });
    });

    return () => {
      ativo = false;
    };
  }, [id, idUsuarioLogado]);

  async function salvarPerfil() {
    if (!usuario?.id) return;

    try {
      const dadosPerfil = {
        nome: formulario.nome,
        username: formulario.username || null,
        cargo: formulario.cargo,
        is_admin: usuario.is_admin,
      };

      if (formulario.senha) {
        dadosPerfil.senha = formulario.senha;
      }

      const { data } = await api.put(`/funcionarios/${usuario.id}`, dadosPerfil);

      const usuarioAtualizado = data || { ...usuario, ...formulario };
      setUsuario(usuarioAtualizado);

      if (String(usuarioAtualizado.id) === String(idUsuarioLogado)) {
        setUsuarioLogado(usuarioAtualizado);
      }

      alert("Perfil atualizado com sucesso!");
      navigate("/");
    } catch (error) {
      alert("Erro ao salvar perfil: " + (error.response?.data?.error || error.message));
    }
  }

  async function selecionarFoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !usuario?.id) return;

    setErroFoto("");
    setMensagemFoto("");
    setSalvandoFoto(true);

    try {
      const fotoPreparada = await prepararFoto(file);
      await api.put(`/funcionarios/${usuario.id}/foto`, fotoPreparada, {
        headers: { "Content-Type": "image/jpeg" },
      });

      const usuarioAtualizado = {
        ...usuario,
        foto_perfil_atualizada_em: new Date().toISOString(),
      };
      setUsuario(usuarioAtualizado);
      if (String(usuarioAtualizado.id) === String(idUsuarioLogado)) {
        setUsuarioLogado(usuarioAtualizado);
      }

      setMensagemFoto("Foto de perfil atualizada.");
    } catch (error) {
      setErroFoto(error.response?.data?.error || error.message || "Não foi possível atualizar a foto.");
    } finally {
      setSalvandoFoto(false);
    }
  }

  async function removerFoto() {
    if (!usuario?.id) return;

    setErroFoto("");
    setMensagemFoto("");
    setRemovendoFoto(true);

    try {
      await api.delete(`/funcionarios/${usuario.id}/foto`);
      const usuarioAtualizado = { ...usuario, foto_perfil_atualizada_em: null };
      setUsuario(usuarioAtualizado);
      if (String(usuarioAtualizado.id) === String(idUsuarioLogado)) {
        setUsuarioLogado(usuarioAtualizado);
      }
      setMensagemFoto("Foto de perfil removida.");
    } catch (error) {
      setErroFoto(error.response?.data?.error || "Não foi possível remover a foto.");
    } finally {
      setRemovendoFoto(false);
    }
  }

  async function excluirPerfil() {
    if (!usuario?.id) return;

    const confirmar = window.confirm("Tem certeza que deseja excluir este perfil?");
    if (!confirmar) return;

    try {
      await api.delete(`/funcionarios/${usuario.id}`);
      alert("Perfil excluído com sucesso!");
      navigate("/");
    } catch (error) {
      alert("Erro ao excluir perfil: " + (error.response?.data?.error || error.message));
    }
  }

  function sair() {
    limparUsuarioLogado();
    navigate("/login", { replace: true });
  }

  if (!usuario) {
    return (
      <div className="perfilPage">
        <Header title="Ver perfil" previousScreen="/visao-geral" />
        <main className="perfilMain">
          <h1>Perfil não encontrado</h1>
        </main>
      </div>
    );
  }

  const podeAlterarFoto = String(usuario.id) === String(idUsuarioLogado);
  const urlFoto = getProfilePhotoUrl(usuario) || avatar;

  return (
    <div className="perfilPage">
      <Header title="Ver perfil" previousScreen="/visao-geral" />

      <main className="perfilMain">
        <section className="perfilForm">
          <h1>Ver perfil</h1>
          <div className="linhaDivisoria" />

          <label>Nome</label>
          <input
            value={formulario.nome}
            onChange={(event) =>
              setFormulario({ ...formulario, nome: event.target.value })
            }
          />

          <label>Usuário</label>
          <input
            value={formulario.username}
            onChange={(event) =>
              setFormulario({ ...formulario, username: event.target.value })
            }
          />

          <label>Cargo</label>
          <input
            value={formulario.cargo}
            onChange={(event) =>
              setFormulario({ ...formulario, cargo: event.target.value })
            }
          />

          <label>Senha</label>
          <input
            type="password"
            value={formulario.senha}
            placeholder="Nova senha"
            onChange={(event) =>
              setFormulario({ ...formulario, senha: event.target.value })
            }
          />
        </section>

        <aside className="perfilCard">
          <div className="perfilAvatar">
            <img
              src={urlFoto}
              alt={`Foto de perfil de ${formulario.nome || usuario.nome}`}
              onError={(event) => {
                event.currentTarget.src = avatar;
              }}
            />
          </div>

          <h2>{formulario.nome || usuario.nome}</h2>

          {podeAlterarFoto && (
            <div className="perfilFotoAcoes">
              <input
                ref={inputFoto}
                className="perfilFotoInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selecionarFoto}
                disabled={salvandoFoto || removendoFoto}
                aria-label="Escolher uma foto de perfil"
              />
              <button
                className="btnFoto"
                type="button"
                onClick={() => inputFoto.current?.click()}
                disabled={salvandoFoto || removendoFoto}
              >
                {salvandoFoto ? "ENVIANDO FOTO..." : "ESCOLHER FOTO"}
              </button>
              {usuario.foto_perfil_atualizada_em && (
                <button
                  className="btnRemoverFoto"
                  type="button"
                  onClick={removerFoto}
                  disabled={salvandoFoto || removendoFoto}
                >
                  {removendoFoto ? "REMOVENDO..." : "REMOVER FOTO"}
                </button>
              )}
              <p className="perfilFotoAjuda">JPEG, PNG ou WebP · até 10 MB</p>
              {erroFoto && <p className="perfilFotoErro" role="alert">{erroFoto}</p>}
              {mensagemFoto && <p className="perfilFotoSucesso" role="status">{mensagemFoto}</p>}
            </div>
          )}

          <div className="perfilAcoes">
            <button className="btnSalvar" onClick={salvarPerfil}>
              SALVAR
            </button>
            <button className="btnLixeira" onClick={excluirPerfil} aria-label="Excluir perfil">
              X
            </button>
          </div>
          <button className="btnSair" onClick={sair}>
            SAIR
          </button>
        </aside>
      </main>
    </div>
  );
}

export default VerPerfil;
