// Endereço e telefone na arte: o erro que mais volta e o mais bobo de evitar.
//
// PRA QUE (Roberto): "uma coisa que tem feito muito de errado na CIIL é colocar o endereço errado —
// não conferir se é a arte pra loja de Araruama ou pra de São Gonçalo". E depois: "quando o social
// envia o pedido, a IA já verifica se colocou localização, e passa isso pro designer".
//
// A conferência não tenta adivinhar se a peça PRECISA de endereço — quem sabe isso é quem pede. Ela
// faz duas coisas concretas: entrega os dados corretos do cadastro (para o designer não caçar em
// conversa antiga) e AVISA quando o cliente tem mais de um endereço, que é exatamente o caso onde o
// erro acontece.

export interface DadosContato {
  endereco?: string | null;
  telefone?: string | null;
}

export interface ConferenciaContato {
  /** Bloco pronto para colar no briefing do designer. Vazio quando não há o que dizer. */
  texto: string;
  /** O cliente tem mais de uma unidade — é onde nasce o erro de endereço trocado. */
  multiplasUnidades: boolean;
  /** O pedido menciona endereço/telefone? Se menciona e há várias unidades, precisa conferir qual. */
  pedidoMencionaContato: boolean;
}

/** Separadores que a casa usa para listar mais de uma unidade no mesmo campo. */
function unidades(endereco: string): string[] {
  return endereco.split(/\s+·\s+|\s+\|\s+/).map((u) => u.trim()).filter(Boolean);
}

const RX_MENCAO = /\b(endere[çc]o|localiza[çc][ãa]o|unidade|loja\s+d[eo]|filial|telefone|whats|contato|rua|avenida|av\.|rod\.|rodovia)\b/i;

export function conferirContato(
  dados: DadosContato,
  textoDoPedido: string,
  nomeCliente: string,
): ConferenciaContato {
  const endereco = (dados.endereco ?? "").trim();
  const telefone = (dados.telefone ?? "").trim();
  const pedidoMencionaContato = RX_MENCAO.test(textoDoPedido ?? "");

  if (!endereco && !telefone) {
    // Sem dado no cadastro, o aviso honesto é esse — e é acionável: alguém preenche.
    return {
      texto: `⚠️ ${nomeCliente} está sem endereço e telefone no cadastro. Se a peça leva contato, confirme com o social antes de fechar.`,
      multiplasUnidades: false, pedidoMencionaContato,
    };
  }

  const lista = endereco ? unidades(endereco) : [];
  const multiplasUnidades = lista.length > 1;

  const linhas: string[] = ["📍 *Contato para a arte* (do cadastro, confira antes de fechar)"];
  if (multiplasUnidades) {
    linhas.push(
      `⚠️ ${nomeCliente} tem ${lista.length} unidades. Confirme com quem pediu QUAL entra nesta peça:`,
    );
    lista.forEach((u, i) => linhas.push(`   ${i + 1}. ${u}`));
  } else if (endereco) {
    linhas.push(`   Endereço: ${endereco}`);
  }
  if (telefone) linhas.push(`   Telefone: ${telefone}`);

  return { texto: linhas.join("\n"), multiplasUnidades, pedidoMencionaContato };
}
