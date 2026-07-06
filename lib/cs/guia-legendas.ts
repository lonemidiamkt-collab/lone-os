// lib/cs/guia-legendas.ts — o "Guia de Legendas" da Lone (mandado pelo social) virado base de
// conhecimento do agente: o MÉTODO (universal, entra no system) + a FICHA de cada cliente (voz,
// contato exato, condições, o que observar) que a geração de legenda injeta pro cliente da vez.
// Fonte: guia-legendas-lone.pdf. Editar aqui pra atualizar.

// ── Método universal (entra no system prompt da legenda) ──────────────────────
export const METODO_LEGENDA = `# Método Lone de legenda (guia oficial do social)
6 REGRAS DE OURO (inegociáveis):
1. TODA legenda FECHA COM CONTATO — endereço e/ou telefone/WhatsApp, SEM exceção (nem institucional). Use a ficha do cliente.
2. Escreva na VOZ do cliente (a ficha diz o tom) — não invente um tom novo.
3. NUNCA invente informação — preço, medida, material, marca: só o que a arte confirma. Na dúvida, omita.
4. Preserve dados exatos — preço, validade e condição (à vista/PIX/cartão) batem 100% com a arte.
5. Carrossel × post único — vários produtos numa arte = carrossel ("arrasta pro lado"); uma imagem = post único.
6. BENEFÍCIO antes de característica — não diga só "bloco com isolamento", diga "casa mais fresca e conta de luz menor".

ANATOMIA (nesta ordem): Gancho (1ª linha: dor/pergunta que para a rolagem — nunca "Olá, somos…") → Desenvolvimento (liga característica a benefício real) → Oferta (preço/condição/validade, SÓ se post de produto e a arte confirmar) → CTA (o que fazer agora) → CONTATO (endereço + telefone, sempre).

2 TIPOS DE POST:
- PRODUTO (vender/converter, fundo de funil): foco em preço, condição, urgência. CTA "garanta", "corra pra loja".
- INSTITUCIONAL/bastidor (marca/confiança, topo/meio): foco em história, valores, prova social. CTA "vem conhecer". NÃO force venda/preço num institucional.

TOM (Região dos Lagos-RJ): português informal e caloroso; frases curtas com quebras de linha pra respirar; emojis com moderação (uns 2 a 6, nunca em toda linha nem zero); traduza o técnico em benefício do dia a dia; se o cliente tem frase-assinatura, feche com ela.
NÃO: parede de texto; reaproveitar legenda de outro cliente; afirmar medida/material/marca que a arte não confirma; prometer resultado em produto de saúde (foque benefício + ciência).`;

// ── Ficha por cliente (voz, contato, condições, o que observar) ───────────────
interface Ficha { nome: string; voz: string; contato: string; condicoes?: string; observar?: string; }

// Chave = @handle sem arroba (normalizada). O matcher também casa pelo nome.
const FICHAS: Record<string, Ficha> = {
  reformarconstrucao: { nome: "Reformar Construção (Construção/Tintas)",
    voz: "Promocional e animado. Campanhas mensais com nome (ex: 'Julho Imbatível'). Cria urgência ('antes que acabe').",
    contato: "Av. Saquarema, 810 – Porto Novo, Saquarema · (22) 99949-4461",
    condicoes: "Sempre à vista dinheiro/PIX, retirando na loja. Validade no fim do mês.",
    observar: "Tem sistema tintométrico ('fazemos sua tinta na hora'). Muitos itens numa arte = carrossel." },
  "calabria.decoracoes": { nome: "Calábria Decorações (Pisos/Decoração)",
    voz: "Elegante mas acessível. Bandeira: 'um dos maiores estoques de Maricá' (variedade + disponibilidade).",
    contato: "São José de Imbassaí, Maricá – RJ (ao lado do Supermarket)",
    condicoes: "Preço no PIX, retirando. Validade com data.",
    observar: "SEM telefone público — usar sempre o endereço. Convida pro showroom." },
  madeireiradaldeiaspa: { nome: "Madeireira D'Aldeia (Madeireira)",
    voz: "Institucional e sólida. Tripé: procedência + resistência + entrega no prazo. Vende confiança.",
    contato: "Rod. Amaral Peixoto, Km 107 – Lt 1,2,3,4, São Pedro da Aldeia · (22) 99241-2992 / (22) 2621-2326",
    observar: "Produtos: tábua de pinus, madeira p/ obra, fôrmas de concreto, marcenaria. Costuma ser institucional (confiança), não cobre venda direta." },
  madeirao_moveis: { nome: "Madeirão Móveis (Móveis)",
    voz: "Aconchego, tradição e qualidade. Produtos com nome próprio ('Poltrona Bela', 'Cômoda Florença'). Usa 'link na bio'.",
    contato: "Av. Paulino P. Pinheiro, 130 – Centro, Iguaba Grande · (22) 99974-7847",
    observar: "NÃO confundir com @madeiraomadeiras_iguaba — mesmo grupo, telefone DIFERENTE." },
  madeiraomadeiras_iguaba: { nome: "Madeirão Madeiras (Pisos/Madeiras)",
    voz: "Técnico-comercial. Descreve tonalidade e uso do piso.",
    contato: "Av. Paulino P. Pinheiro, 130 – Centro, Iguaba Grande · (22) 99751-8669",
    condicoes: "À vista dinheiro/PIX + preço no cartão. Retirada no pátio.",
    observar: "Cliente SEPARADO do @madeirao_moveis. Mesmo endereço, telefone diferente." },
  edumarautopecas: { nome: "Edumar Auto Peças (Auto peças/Pneus)",
    voz: "Direto e prático. Foco em segurança e urgência ('risco de acidente'). Lista benefícios com marcação.",
    contato: "Rod. Amaral Peixoto, Km 85 – Vila Capri, Araruama – RJ · (22) 99967-6586",
    observar: "CTA: consultar disponibilidade no WhatsApp." },
  hentzyacabamentos: { nome: "Hentzy Acabamentos (Pisos/Acabamentos)",
    voz: "Sofisticação + preço justo. Cada piso ganha uma microdescrição entre parênteses.",
    contato: "R. Jorge Ulrick, 221 – Nova Esperança, Rio das Ostras · (22) 99788-2641",
    condicoes: "SEMPRE 2 preços → à vista dinheiro/PIX e cartão. Validade 30 dias." },
  portugaspneus: { nome: "Portuga Pneus (Pneus/Automotivo)",
    voz: "Direto, 'melhor preço', serviço rápido. CTA WhatsApp ('garanta a sua').",
    contato: "Rod. Amaral Peixoto – Vila Capri, Araruama (ao lado do Super Market) · (22) 2665-5286",
    observar: "Serviços: pneu + troca de óleo etc." },
  imperiodospisosrj: { nome: "Império dos Pisos (Pisos/Porcelanato)",
    voz: "'Menor preço da região', 'preço de galpão'. Listas longas de produtos, 'arrasta pro lado'.",
    contato: "(22) 99610-3383 · Loja 1: Rua Visconde Cavalcante, 42 – Rio do Limão, Araruama · Loja 2: RJ 124, Km 30 – Paracatu, Araruama",
    condicoes: "À vista dinheiro/PIX retirando em loja. Validade fim do mês." },
  mercadaodaconstrucao: { nome: "Mercadão da Construção (Construção)",
    voz: "'Preço imbatível de balcão'. Foco em impermeabilização e estrutura.",
    contato: "Av. Teixeira e Souza, 1610 – Centro, Cabo Frio – RJ · (22) 2647-2020",
    condicoes: "Preço de balcão, retirada na loja, à vista dinheiro/PIX. CTA WhatsApp." },
  engetec_projetos: { nome: "Engetec (Energia solar/Elétrica)",
    voz: "Soluciona problema (conta de luz alta, disjuntor desarmando). Técnico confiável. Custo → investimento.",
    contato: "Rua Paraná, lt 11 – Paracatu, Araruama – RJ · (22) 99715-7096",
    observar: "CTA: simulação gratuita." },
  blocofast: { nome: "Blocofast (Blocos sustentáveis)",
    voz: "Educativo (awareness). Benefícios: menor consumo de energia + conforto acústico + sustentabilidade.",
    contato: "(a confirmar com o cliente — pedir telefone/endereço antes de postar)",
    observar: "NÃO afirmar o material do bloco (ex.: EPS) sem confirmar — usar 'nossos blocos'." },
  dumarcomercio: { nome: "Dumar (Ferramentas/Peças)",
    voz: "Informal, 'padrão Dumar'. Assinatura no fim: 'Vai na Dumar, lá tem!'. Estoque completo, marcas Makita/Vonder.",
    contato: "(a confirmar com o cliente — provável Araruama)",
    observar: "Tem posts de produto E institucionais (ex.: treinamento). Assistência técnica autorizada." },
  tindarosolar: { nome: "Tindaro Solar (Energia solar)",
    voz: "Economia de até 95%, custo fixo → investimento. Energia limpa + valorização do imóvel.",
    contato: "Rua Coronel Ribeiro Sobrinho, 80 – Arrozal · (24) 99918-3544",
    observar: "CTA: simulação gratuita." },
  "arte.em.manipulacao": { nome: "Arte em Manipulação (Manipulação/Saúde)",
    voz: "Saúde com base científica. Tratamento personalizado > soluções genéricas.",
    contato: "(22) 99742-9275 / (22) 2238-0100 · Av. John Kennedy, 82 | Trade Center - Loja 13, Centro, Araruama · Rua Ary Barroso, 26 - Centro, Araruama",
    observar: "Produto de SAÚDE: cuidado com promessas — foque em benefício e ciência, sem garantir cura/resultado." },
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/** Acha a ficha do cliente pelo nome (casa por handle ou por palavras distintivas do nome). */
export function fichaDoCliente(clienteNome: string): string | null {
  const alvo = norm(clienteNome);
  if (!alvo) return null;
  let ficha: Ficha | undefined = FICHAS[alvo];
  if (!ficha) {
    // Casa se o handle normalizado ou o nome da ficha contém/está contido no alvo.
    for (const [handle, f] of Object.entries(FICHAS)) {
      const h = norm(handle);
      const n = norm(f.nome.split("(")[0]);
      if (alvo.includes(h) || h.includes(alvo) || (n.length >= 4 && (alvo.includes(n) || n.includes(alvo)))) { ficha = f; break; }
    }
  }
  if (!ficha) return null;
  return [
    `FICHA DO CLIENTE — ${ficha.nome}`,
    `• Voz: ${ficha.voz}`,
    ficha.condicoes ? `• Condições: ${ficha.condicoes}` : "",
    `• CONTATO (fechar a legenda com isto): ${ficha.contato}`,
    ficha.observar ? `• Atenção: ${ficha.observar}` : "",
  ].filter(Boolean).join("\n");
}
