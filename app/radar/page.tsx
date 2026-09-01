import { redirect } from "next/navigation";

// O Radar deixou de ser uma área própria e virou a primeira seção do Planejamento — é lá que a
// semana de conteúdo é decidida, e olhar referência faz parte de planejar, não é outro assunto.
//
// A rota fica de pé como redirecionamento porque o link já circulou: quem tiver /radar salvo ou
// receber o endereço numa conversa antiga cai no lugar certo, em vez de num 404.
export default function RadarRedirect() {
  redirect("/planejamento");
}
