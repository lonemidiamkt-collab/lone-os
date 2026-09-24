import { redirect } from "next/navigation";

// /integrations — endereço antigo (e-mail do check-meta-token, banner de token, favoritos). A tela
// tinha 11 cartões, 10 simulados; sobrou a conexão real, que agora mora em Sistema › Conexão Meta.
export default function IntegrationsPage() {
  redirect("/conexao-meta");
}
