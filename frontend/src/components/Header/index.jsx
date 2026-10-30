import { useNavigate } from "react-router-dom";
import avatarUser from "../../assets/avatar.png";
import { getProfilePhotoUrl } from "../../utils/profilePhoto";
import "./index.css";

function Header({ title, previousScreen, nextScreen, usuario = null }) {
  const navigate = useNavigate();
  const cargoUsuario = usuario?.cargo || usuario?.tipo;

  const voltar = () => {
    if (typeof previousScreen === "function") {
      previousScreen();
      return;
    }
    navigate(previousScreen || -1);
  };
  
  return (
    <div id="headerBar" className={!usuario ? "semUsuario" : ""}>
      <div className="linha1">
        <button id="btnPrevious" onClick={voltar}>
          &#8592;
        </button>

        <span id="headerTitle">{title}</span>

        {nextScreen && (
          <button id="btnNext" onClick={() => navigate(nextScreen.rota)}>
            {nextScreen.texto} &#8594;
          </button>
        )}
      </div>

      {usuario && (
        <div className="usuarioContainer">
          <div className="usuarioText">
            <span id="usuarioNome">{usuario.nome}</span>
            {cargoUsuario && <span id="usuarioCargo">{cargoUsuario}</span>}
            <button
              id="btnAction"
              onClick={() => navigate(`/perfil/${usuario.id}`)}
            >
              Ver perfil
            </button>
          </div>

          <div id="avatarUsuario">
            <img
              src={getProfilePhotoUrl(usuario) || avatarUser}
              alt={`Foto de perfil de ${usuario.nome}`}
              onError={(event) => {
                event.currentTarget.src = avatarUser;
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Header;