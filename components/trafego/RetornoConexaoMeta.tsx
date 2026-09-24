"use client";

// O login da Meta (OAuth) volta para /traffic#access_token=… — é o endereço cadastrado no app da
// Meta, e trocá-lo exige mexer no painel de desenvolvedor. Quem guardava o token era a aba Anúncios
// (que chamava a Meta pelo navegador); agora a conexão mora em Sistema › Conexão Meta. Este
// componente, montado no /traffic, só repassa o retorno do login para lá, com o hash intacto.

import { useEffect } from "react";
import { ROTA_CONEXAO_META } from "@/lib/trafego/anuncios";

export default function RetornoConexaoMeta() {
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("access_token=")) window.location.replace(`${ROTA_CONEXAO_META}${hash}`);
  }, []);
  return null;
}
