import api from "../services/api";

export function getProfilePhotoUrl(usuario) {
  if (!usuario?.id) return "";

  const baseURL = api.defaults.baseURL.replace(/\/+$/, "");
  const versao = usuario.foto_perfil_atualizada_em
    ? `?v=${encodeURIComponent(usuario.foto_perfil_atualizada_em)}`
    : "";

  return `${baseURL}/funcionarios/${usuario.id}/foto${versao}`;
}
