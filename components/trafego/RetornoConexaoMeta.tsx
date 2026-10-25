"use client";

// O login da Meta (OAuth) volta para /traffic#access_token=… — é o endereço cadastrado no app da
// Meta, e trocá-lo exige mexer no painel de desenvolvedor. Quem guardava o token era a aba Anúncios
// (que chamava a Meta pelo navegador); agora a conexão mora em Sistema › Conexão Meta. Este
// componente, montado no /traffic, só repassa o retorno do login para lá, com o hash intacto.
//
// 25/10/2026 (auditoria 9.5): o erro do Facebook (`?error=access_denied…`, quando a pessoa cancela ou
// nega a permissão) também é repassado — antes ficava parado no /traffic e ninguém via nada.

import { useEffect } from "react";
import { ROTA_CONEXAO_META } from "@/lib/trafego/anuncios";

export default function RetornoConexaoMeta() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { hash, search } = window.location;
    const veioDoLogin = hash.includes("access_token=") || /[?&]error=/.test(search) || hash.includes("error=");
    if (veioDoLogin) window.location.replace(`${ROTA_CONEXAO_META}${search}${hash}`);
  }, []);
  return null;
}
