import { redirect } from "next/navigation";

// /meus-clientes — virou o filtro "Meus clientes" da lista única de Clientes (Leva 5a).
//
// Eram quatro listas de cliente (Clientes, Meus Clientes, a Carteira do Social e os "Clientes do
// Quadro" do Designer), cada uma com um pedaço. Agora é uma: /clients, que para quem executa já abre
// só com a própria carteira. O briefing, que era o motivo desta tela, está na ficha do cliente
// (aba Briefing), editável por quem está na ficha dele.
//
// A rota fica de pé como redirecionamento: link salvo, notificação antiga e mensagem de WhatsApp
// continuam caindo no lugar certo.
export default function MeusClientesRedirect() {
  redirect("/clients?resp=mine");
}
