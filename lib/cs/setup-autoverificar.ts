// AUTOVERIFICAÇÃO DO SETUP — o Loninho confere sozinho, em vez de esperar alguém marcar.
//
// Roberto (02/09/2026): "você pode verificar no sistema também, olhar na parte do sistema se eles
// já mandaram as três… se você viu que o Julio já fez a conta, você verifica sozinho: se o email
// da Lone Mídia, a conta do Facebook da Lone Mídia já tem a conta, então significa que o Julio já
// fez. Se eu não tiver, porque o Julio ainda não fez, então faz essa cobrança."
//
// Por que isto importa além do setup: o checklist marcava item como feito SÓ quando alguém
// clicava em /tarefas. É a mesma causa-raiz que deixou 206 cards de agosto presos no board — o
// trabalho acontece e o registro não volta. Aqui o sistema olha o resultado em vez de esperar o
// registro, e marca a tarefa como concluída quando encontra a prova. Sem isso, o task-reminders
// segue cobrando por PDF uma coisa que já está pronta.
//
// REGRA DE OURO: só marca o que tem PROVA. "Não achei" nunca vira "feito" — na dúvida a cobrança
// continua, porque acusar de pendente o que está pronto irrita, mas dar por pronto o que não está
// deixa o cliente sem entrega.

import { metaJson } from "@/lib/meta/fetch";

export interface ProvasCliente {
  /** Artes com entrega registrada. As "3 fixadas" precisam de 3. */
  artesEntregues: number;
  /** ID da conta de anúncio no cadastro. Preenchido ≠ acessível. */
  metaAdAccountId: string | null;
  /** Houve gasto nos últimos 30 dias. */
  anuncioRodando: boolean;
  /** A conta responde à NOSSA credencial? null = não deu para checar (não é prova de nada). */
  contaAcessivel: boolean | null;
}

export interface ItemVerificado {
  chave: string;
  feito: boolean;
  /** Por que o sistema concluiu isso. Vai para o comentário da tarefa — um "feito" sem
   *  justificativa é indistinguível de um bug. */
  prova?: string;
}

/**
 * Pergunta à Meta se a conta de anúncio responde à nossa credencial.
 *
 * É a diferença entre "o Julio digitou o ID no cadastro" e "o Julio conseguiu o acesso". Só o
 * segundo significa trabalho feito — e é exatamente o caso que o Roberto descreveu.
 *
 * Devolve `null` quando a checagem falhou por motivo NOSSO (rede, limite de chamadas da Meta):
 * tratar isso como "sem acesso" produziria cobrança falsa toda vez que a Meta engasgasse.
 */
export async function contaAcessivel(adAccountId: string, token: string): Promise<boolean | null> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  try {
    await metaJson(
      `https://graph.facebook.com/v21.0/${id}?fields=id,account_status&access_token=${encodeURIComponent(token)}`,
      { label: `setup:acesso:${id}`, tentativas: 2 },
    );
    return true;
  } catch (e) {
    const msg = String(e);
    // 190 = token inválido; 100/803 = objeto inexistente ou fora do nosso alcance; 200 = sem
    // permissão. Estes significam "não temos acesso" — resposta legítima da Meta.
    if (/\b(100|190|200|803)\b/.test(msg) || /permission|does not exist|Unsupported/i.test(msg)) return false;
    // Qualquer outra coisa (429, 5xx, timeout) é problema nosso: não sabemos.
    return null;
  }
}

/** O que dá para concluir sem depender de ninguém marcar nada. */
export function verificarItens(p: ProvasCliente): ItemVerificado[] {
  const out: ItemVerificado[] = [];

  // As 3 fixadas: exige TRÊS artes entregues. Com uma ou duas, o item continua aberto — é o
  // número que o playbook define, e arredondar para baixo aqui entregaria perfil incompleto.
  if (p.artesEntregues >= 3) {
    out.push({ chave: "fixados", feito: true, prova: `${p.artesEntregues} artes com entrega registrada no sistema` });
  }

  // Conta vinculada: o cadastro preenchido é metade; o acesso confirmado é a outra.
  if (p.metaAdAccountId && p.contaAcessivel === true) {
    out.push({ chave: "conta_meta", feito: true, prova: `conta ${p.metaAdAccountId} responde à credencial da Lone` });
  }

  // Anúncio no ar: gasto nos últimos 30 dias é prova de campanha rodando, não de campanha criada.
  if (p.anuncioRodando) {
    out.push({ chave: "anuncio", feito: true, prova: "houve gasto na conta nos últimos 30 dias" });
  }

  return out;
}

/**
 * O que está ATRASADO e por quê — a mensagem que o Roberto pediu, nomeando a causa.
 *
 * Diferente da cobrança genérica, aqui cada linha diz o que o sistema observou. "Não tem anúncio
 * ativo e não tem verba, então significa que está atrasado" é uma frase que a pessoa consegue
 * agir em cima; "item de setup pendente" não é.
 */
export function motivosDeAtraso(p: ProvasCliente, cuidaDoTrafego: boolean): string[] {
  const m: string[] = [];
  if (cuidaDoTrafego) {
    if (!p.metaAdAccountId) m.push("conta de anúncio ainda não foi vinculada no Lone OS");
    else if (p.contaAcessivel === false) m.push(`conta ${p.metaAdAccountId} está no cadastro mas NÃO responde à nossa credencial — falta liberar o acesso`);
    else if (p.contaAcessivel === null) m.push(`não consegui conferir o acesso à conta ${p.metaAdAccountId} agora (Meta indisponível)`);
    if (p.metaAdAccountId && p.contaAcessivel === true && !p.anuncioRodando) m.push("temos acesso à conta, mas nenhum anúncio gastou nos últimos 30 dias");
  }
  if (p.artesEntregues === 0) m.push("nenhuma arte entregue até agora");
  else if (p.artesEntregues < 3) m.push(`só ${p.artesEntregues} de 3 artes fixadas entregues`);
  return m;
}
