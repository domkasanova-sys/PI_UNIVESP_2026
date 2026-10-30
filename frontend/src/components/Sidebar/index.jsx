import "./index.css";
import { NavLink } from "react-router-dom";
import { isAdmin } from "../../utils/session";

function Sidebar({ ativo, usuario }) {
  const itensMenuAdmin = [
    { nome: "Visão geral", href: "/visao-geral" },
    { nome: "Minha escala", href: "/minha-escala" },
    { nome: "Gestão de Funcionários", href: "/funcionarios" },
    { nome: "Gestão de Escalas", href: "/escalas" },
    { nome: "Gestão de Tarefas", href: "/tarefas" },
    {nome: "Checklist", href: "/checklist"},
  ];

  const itensMenu = isAdmin(usuario)
    ? itensMenuAdmin
    : [
        ...itensMenuAdmin.filter(
          (item) =>
            item.href === "/visao-geral" ||
            item.href === "/minha-escala" ||
            item.href === "/checklist"
        ),
        { nome: "Minhas tarefas", href: "/minhas-tarefas" },
      ];

  return (
    <div className="sidebarContainer">
      {itensMenu.map((item) => {
        const estaAtivo = item.nome === ativo;

        return (
          <NavLink
            className={`itemSidebar ${estaAtivo ? "itemAtivo" : ""}`}
            key={item.nome}
            to={item.href}
          >
            <span className="itemNome">{item.nome}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

export default Sidebar;