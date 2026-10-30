import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import Signup from './pages/Singup';
import Login from './pages/Login';
import VisaoGeral from './pages/Home';
import Funcionarios from './pages/Funcionarios';
import Escalas from './pages/Escalas';
import Tarefas from './pages/Tarefas';
import Perfil from './pages/Perfil';
import Checklist from './pages/checklist/checklist';
import MinhaEscala from './pages/MinhaEscala';
import MinhasTarefas from './pages/MinhasTarefas';
import { getUsuarioLogado, isAdmin } from './utils/session';

function RotaAdmin({ children }) {
  const usuario = getUsuarioLogado();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (usuario && !isAdmin(usuario)) {
    return <Navigate to="/visao-geral" replace />;
  }

  return children;
}

function RotaPrivada({ children }) {
  const usuario = getUsuarioLogado();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return children;
}


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={< Signup/>} />
        <Route path="/login" element={<Login />} />
        <Route path="/visao-geral" element={<RotaPrivada><VisaoGeral /></RotaPrivada>} />
        <Route path="/minha-escala" element={<RotaPrivada><MinhaEscala /></RotaPrivada>} />
        <Route path="/minhas-tarefas" element={<RotaPrivada><MinhasTarefas /></RotaPrivada>} />
        <Route path="/funcionarios" element={<RotaAdmin><Funcionarios /></RotaAdmin>} />
        <Route path="/escalas" element={<RotaAdmin><Escalas /></RotaAdmin>} />
        <Route path="/tarefas" element={<RotaAdmin><Tarefas /></RotaAdmin>} />
        <Route path="/checklist" element={<RotaPrivada><Checklist /></RotaPrivada>} />
        <Route path="/perfil/:id" element={<RotaPrivada><Perfil /></RotaPrivada>} />
        <Route path="/ver-perfil" element={<RotaPrivada><Perfil /></RotaPrivada>} />
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;
