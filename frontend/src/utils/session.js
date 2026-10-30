const STORAGE_KEY = "usuarioLogado";
const TOKEN_KEY = "tokenAutenticacao";

export function getUsuarioLogado() {
  try {
    const usuario = localStorage.getItem(STORAGE_KEY);
    return usuario ? JSON.parse(usuario) : null;
  } catch {
    return null;
  }
}

export function setUsuarioLogado(usuario) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usuario));
}

export function getTokenAutenticacao() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokenAutenticacao(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function limparUsuarioLogado() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function isAdmin(usuario = getUsuarioLogado()) {
  return !usuario || usuario.is_admin === true;
}
