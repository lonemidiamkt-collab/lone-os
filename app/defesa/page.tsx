import { redirect } from "next/navigation";

// /defesa — a Defesa Ativa virou aba do Tráfego (Leva 4, 24/09/2026): os alertas de uma conta
// passaram a morar num lugar só (components/trafego/defesa/DefesaAtiva.tsx). O endereço antigo
// continua valendo — botão da Área CEO, links salvos e favoritos caem direto na aba.
export default function DefesaAtivaRedirect() {
  redirect("/traffic?aba=defesa");
}
