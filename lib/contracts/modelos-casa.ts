// lib/contracts/modelos-casa.ts — os modelos de contrato da casa (cláusulas em contract_templates), revisados
// em 26/10/2026 a partir dos contratos assinados que o Roberto separou (JP Barbearia, Celmapel, Dominos, Boali,
// Armazém dos Fios, ACM e Elace Glass). Decisões dele no chat:
//
//   · base = o modelo do agente (12 cláusulas, ciclos de 3 meses sem fidelidade);
//   · "só tráfego" passa a usar o ESCOPO DO CONTRATO DA JP: direção criativa, roteiros e edição pontual; os
//     criativos são do cliente; ficam de fora, com todas as letras, artes, social media e outras plataformas.
//     O modelo anterior era o Lone Growth recortado — falava em "design, edição e criativos" e não excluía
//     social media (o cliente podia cobrar post);
//   · encerramento PROPORCIONAL aos dias (o da Celmapel): passados os 30 dias de aviso, encerra no dia, sem
//     cobrar o que vier depois. O modelo anterior encerrava "na data de vencimento" seguinte;
//   · prazo determinado (contrato de teste, como o da JP, 2 meses) tem cláusula de prazo própria — antes o
//     quadro-resumo dizia "prazo determinado" e a Cláusula Segunda falava em ciclos e renovação automática.
//
// As cláusulas moram no BANCO (Configurações › Jurídico › Templates editam); aqui fica o texto revisado e a
// função que aplica as trocas parágrafo a parágrafo — recusa se o parágrafo esperado não estiver lá (alguém
// editou o modelo pela tela), em vez de sobrescrever às cegas. Aplicação: sqlDaRevisao(), no fim do arquivo.

export interface Clausula { id: string; title: string; body: string; enabled?: boolean }

/** Cláusula Primeira do "só tráfego" — o escopo do contrato da JP Barbearia, sem o nome do cliente. */
export const OBJETO_TRAFEGO: Clausula = {
  id: "objeto",
  title: "DO OBJETO E DO ESCOPO",
  body: [
    "1.1. O presente contrato tem por objeto a prestação de serviços de gestão de tráfego pago da CONTRATANTE na plataforma Meta Ads, abrangendo o planejamento, a execução, o acompanhamento e a otimização das campanhas de mídia paga de {{cliente_nome_fantasia}}.",
    "1.2. A prestação dos serviços compreende as seguintes atividades:\n" + [
      "a) planejamento estratégico das campanhas de mídia paga;",
      "b) criação, configuração, gestão, monitoramento e otimização de campanhas na plataforma Meta Ads;",
      "c) definição de objetivos, públicos, segmentações, formatos de veiculação e distribuição do orçamento aprovado;",
      "d) redação dos textos e chamadas para ação dos anúncios, a partir das informações, ofertas e materiais fornecidos pela CONTRATANTE;",
      "e) realização de análises, testes e otimizações compatíveis com a estratégia adotada e com o orçamento disponível;",
      "f) acompanhamento dos dados e indicadores disponibilizados pela plataforma;",
      "g) elaboração de relatórios semanais de acompanhamento e relatório mensal consolidado;",
      "h) orientação estratégica relacionada aos anúncios, ofertas, serviços, preços e materiais utilizados nas campanhas;",
      "i) direção criativa e elaboração de roteiros para os vídeos utilizados nas campanhas, conforme o planejamento estratégico definido, cabendo à CONTRATANTE a gravação e o envio do material;",
      "j) edição pontual dos vídeos fornecidos pela CONTRATANTE, quando necessária à adequação do material à veiculação nos anúncios;",
      "k) orientações para organização básica do atendimento e aproveitamento dos contatos gerados pelas campanhas;",
      "l) suporte estratégico pelos canais oficiais durante o horário de atendimento.",
    ].join("\n"),
    "1.3. A quantidade de campanhas, conjuntos de anúncios, anúncios, públicos e testes será definida conforme a estratégia adotada, o orçamento disponível e as necessidades da operação.",
    "1.4. Os criativos utilizados nas campanhas serão fornecidos pela CONTRATANTE, que é responsável pela produção, gravação e envio das imagens e vídeos veiculados, permanecendo a cargo da CONTRATADA apenas a direção criativa, os roteiros e a edição pontual previstos nas alíneas \"i\" e \"j\" da cláusula 1.2.",
    "1.5. Não estão incluídos no valor contratado, salvo contratação expressa:\n" + [
      "a) criação de artes, peças gráficas, carrosséis, identidade visual ou qualquer criativo produzido do zero pela CONTRATADA;",
      "b) gravação e produção audiovisual, presencial ou remota, bem como edição de vídeos não destinados às campanhas contratadas;",
      "c) planejamento e gestão de redes sociais, calendário editorial, publicação de conteúdo orgânico e legendas de posts;",
      "d) produção fotográfica ou cobertura de eventos;",
      "e) gestão de campanhas em Google Ads, TikTok Ads ou quaisquer outras plataformas não previstas neste contrato;",
      "f) desenvolvimento ou manutenção de sites, lojas virtuais ou landing pages;",
      "g) atendimento, qualificação ou fechamento de leads em nome da CONTRATANTE;",
      "h) operação diária do setor comercial da CONTRATANTE;",
      "i) implantação ou administração de CRM, sistemas ou automações;",
      "j) contratação de influenciadores, fotógrafos, videomakers, modelos ou outros terceiros;",
      "k) impressão ou produção física de materiais;",
      "l) gestão de outras unidades, marcas, filiais, operações ou CNPJs, ainda que pertencentes aos mesmos sócios ou ao mesmo grupo econômico.",
    ].join("\n"),
    "1.6. A gestão de tráfego contratada destina-se exclusivamente à divulgação de {{cliente_nome_fantasia}}. A inclusão de qualquer outra unidade, marca ou operação dependerá de nova contratação, proposta comercial aceita ou aditivo contratual.",
    "1.7. A solicitação de criação de nova campanha será atendida em até 2 (dois) dias úteis após o recebimento de todas as informações, materiais, acessos e aprovações necessários.",
    "1.8. Alterações de campanhas, anúncios, ofertas ou orçamento serão realizadas em prazo compatível com a complexidade da solicitação e com a organização operacional da CONTRATADA.",
    "1.9. As entregas não realizadas por ausência de materiais, informações, acessos, aprovações ou retorno da CONTRATANTE não serão acumuladas ou transferidas automaticamente para períodos posteriores.",
    "1.10. Serviços não incluídos no escopo dependerão de orçamento adicional e aceite escrito da CONTRATANTE, podendo ser formalizados por proposta comercial ou aditivo contratual.",
  ].join("\n\n"),
};

/** Encerramento proporcional (Celmapel) — os parágrafos 2.10, 2.11 e 2.12 da cláusula de ciclos. */
export const ENCERRAMENTO_PROPORCIONAL: Record<string, string> = {
  "2.10.": "2.10. Durante o período de aviso prévio:\n" + [
    "a) os serviços permanecerão ativos;",
    "b) as obrigações contratuais continuarão vigentes;",
    "c) a CONTRATANTE deverá colaborar com a execução dos serviços; e",
    "d) serão devidos os valores correspondentes ao período em que os serviços forem efetivamente disponibilizados.",
  ].join("\n"),
  "2.11.": "2.11. Decorridos os 30 (trinta) dias do aviso prévio, o contrato será encerrado, independentemente da data mensal de vencimento e do ciclo trimestral em andamento, sem multa de cancelamento e sem cobrança de mensalidades ou valores referentes a período posterior à data efetiva do encerramento.",
  "2.12.": "2.12. Quando necessário para que a cobrança corresponda exatamente ao período de aviso prévio, eventual valor referente a período inferior a uma mensalidade será calculado proporcionalmente aos dias de vigência dos serviços.",
};

/** 10.2 coerente com o encerramento proporcional. */
export const RESCISAO_VALORES_DEVIDOS = "10.2. Independentemente do motivo do encerramento, não serão exigidos valores referentes a período posterior à data efetiva do encerramento, permanecendo devidos:\n" + [
  "a) os valores vencidos;",
  "b) os valores correspondentes ao período em que os serviços permanecerem vigentes até a data efetiva do encerramento, calculados proporcionalmente quando necessário;",
  "c) os serviços adicionais previamente aprovados; e",
  "d) as multas, os juros e os encargos decorrentes de inadimplência.",
].join("\n");

/**
 * Cláusula Segunda do contrato por PRAZO DETERMINADO (teste, projeto fechado) — a do contrato da JP, sem nome
 * nem data chumbados. Entra no lugar da cláusula de ciclos (id "ciclos") quando a modalidade é "determinado".
 * Marcadores: {{duracao_meses}}, {{duracao_meses_extenso}}, {{meses_palavra}}, {{termino_previsto}}.
 */
export const PRAZO_DETERMINADO: Clausula = {
  id: "ciclos",
  title: "DO INÍCIO, DO PRAZO E DO ENCERRAMENTO",
  body: [
    "2.1. O presente contrato entra em vigor na data de sua assinatura, ficando o início operacional dos serviços condicionado:\n" + [
      "a) à confirmação do pagamento da primeira mensalidade;",
      "b) ao fornecimento dos acessos, informações e materiais necessários; e",
      "c) à indicação de um responsável pela comunicação com a CONTRATADA.",
    ].join("\n"),
    "2.2. Recebidos o primeiro pagamento e os elementos necessários à execução dos serviços, a CONTRATADA iniciará o onboarding e o planejamento estratégico em até 2 (dois) dias úteis.",
    "2.3. O presente contrato é celebrado por prazo determinado de {{duracao_meses}} ({{duracao_meses_extenso}}) {{meses_palavra}}, contados da confirmação do pagamento da primeira mensalidade{{termino_previsto}}.",
    "2.4. O contrato se encerrará automaticamente ao final do prazo previsto na cláusula anterior, independentemente de aviso prévio ou de qualquer manifestação das partes, não havendo renovação automática.",
    "2.5. A eventual continuidade da prestação dos serviços após o término dependerá de nova proposta comercial aceita, aditivo contratual ou novo contrato, podendo ser praticadas condições comerciais diversas das previstas neste instrumento.",
    "2.6. Antes do término do prazo contratado, qualquer das partes poderá solicitar o encerramento mediante comunicação escrita, inclusive por WhatsApp ou e-mail, com antecedência mínima de 30 (trinta) dias.",
    "2.7. A comunicação de encerramento antecipado deverá conter indicação breve do motivo da decisão, para fins de registro e organização do encerramento, sem depender da aprovação ou concordância da outra parte.",
    "2.8. Durante o período de aviso prévio:\n" + [
      "a) os serviços permanecerão ativos;",
      "b) as obrigações contratuais continuarão vigentes;",
      "c) a CONTRATANTE deverá colaborar com a execução dos serviços; e",
      "d) serão devidos os valores correspondentes ao período em que os serviços forem efetivamente disponibilizados.",
    ].join("\n"),
    "2.9. Cumprido o aviso prévio e quitados os valores correspondentes ao período de prestação dos serviços, o contrato será encerrado sem multa de cancelamento, sendo eventual valor referente a período inferior a uma mensalidade calculado proporcionalmente aos dias de vigência dos serviços.",
    "2.10. Qualquer alteração de valor, prazo, escopo ou demais condições comerciais dependerá de aceite escrito das partes e poderá ser formalizada por aditivo contratual, proposta comercial aceita ou outro meio eletrônico que permita comprovar a manifestação de vontade.",
  ].join("\n\n"),
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09-09" → "09 de setembro de 2026". `null` se a data não for válida. */
export function dataPorExtenso(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${String(dia).padStart(2, "0")} de ${MESES[mes - 1]} de ${ano}`;
}

/**
 * Término do prazo determinado: mesmo dia, `meses` depois — o da JP começou em 09/09 e termina em 09/11.
 * Dia que não existe no mês de chegada (31/01 + 1) cai no último dia dele.
 */
export function terminoPrevisto(inicioIso: string, meses: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inicioIso ?? "");
  if (!m || !(meses > 0)) return null;
  const total = Number(m[2]) - 1 + meses;
  const ano = Number(m[1]) + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(Number(m[3]), ultimo);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * As cláusulas que entram no contrato conforme a modalidade. No prazo determinado a cláusula de ciclos
 * (renovação automática a cada 3 meses) sai e entra a de prazo — antes o quadro-resumo dizia "prazo
 * determinado, sem renovação" e a Cláusula Segunda dizia o contrário. Pura.
 */
export function clausulasDaModalidade<T extends Clausula>(fixas: T[], modalidade: "ciclos" | "determinado"): Clausula[] {
  if (modalidade !== "determinado") return fixas;
  return fixas.map((c) => {
    if (c.id === "ciclos") return { ...PRAZO_DETERMINADO };
    // 10.1 dos ciclos fala em "restante do ciclo trimestral" — no prazo determinado não há ciclo (JP).
    if (c.id === "rescisao") return { ...c, body: c.body.replace(/ ou cobrança do restante do ciclo trimestral/g, "") };
    return c;
  });
}

/**
 * Troca o parágrafo que começa com `numero` (ex.: "2.11.") — o bloco inteiro, alíneas incluídas — por `novo`.
 * Lança se o parágrafo não existir: modelo editado pela tela não é sobrescrito às cegas.
 */
export function trocarParagrafo(corpo: string, numero: string, novo: string): string {
  const blocos = corpo.split(/\n{2,}/);
  const i = blocos.findIndex((b) => b.trimStart().startsWith(`${numero} `));
  if (i < 0) throw new Error(`parágrafo ${numero} não encontrado`);
  blocos[i] = novo;
  return blocos.join("\n\n");
}

/** O parágrafo que o modelo ANTIGO usava e que mostra que a troca ainda não foi feita. */
const MARCA_ENCERRAMENTO_ANTIGO = /produzirá efeitos na data mensal de vencimento/;

/**
 * As cláusulas revisadas de um modelo. Pura. `servico` = contract_templates.service_type.
 * Idempotente: aplicar de novo num modelo já revisado devolve o mesmo texto.
 */
export function revisarModelo(servico: string, clausulas: Clausula[]): Clausula[] {
  return clausulas.map((c) => {
    if (c.id === "objeto" && servico === "assessoria_trafego") return { ...OBJETO_TRAFEGO };
    if (c.id === "ciclos") {
      let body = c.body;
      for (const [num, novo] of Object.entries(ENCERRAMENTO_PROPORCIONAL)) body = trocarParagrafo(body, num, novo);
      return { ...c, body };
    }
    if (c.id === "rescisao") return { ...c, body: trocarParagrafo(c.body, "10.2.", RESCISAO_VALORES_DEVIDOS) };
    return c;
  });
}

export interface ProblemaModelo { servico: string; problema: string }

/** O que ainda está errado num modelo (para o teste e para o script recusar antes de gravar). Pura. */
export function conferirModelo(servico: string, clausulas: Clausula[]): ProblemaModelo[] {
  const problemas: ProblemaModelo[] = [];
  const p = (problema: string) => problemas.push({ servico, problema });
  if (clausulas.length !== 12) p(`tem ${clausulas.length} cláusulas (esperado 12)`);
  const ciclos = clausulas.find((c) => c.id === "ciclos");
  const rescisao = clausulas.find((c) => c.id === "rescisao");
  if (!ciclos) p("sem a cláusula de prazo (id ciclos)");
  else {
    if (MARCA_ENCERRAMENTO_ANTIGO.test(ciclos.body)) p("encerramento ainda na data de vencimento (não proporcional)");
    if (!/calculado proporcionalmente aos dias/.test(ciclos.body)) p("prazo sem o cálculo proporcional");
  }
  if (!rescisao) p("sem a cláusula de rescisão");
  else if (!/não serão exigidos valores referentes a período posterior/.test(rescisao.body)) p("10.2 sem o limite da data efetiva do encerramento");
  if (servico === "assessoria_trafego") {
    const objeto = clausulas.find((c) => c.id === "objeto")?.body ?? "";
    if (!/direção criativa e elaboração de roteiros/.test(objeto)) p("tráfego sem o escopo da JP (direção criativa e roteiros)");
    if (!/planejamento e gestão de redes sociais/.test(objeto)) p("tráfego não exclui social media");
  }
  return problemas;
}

export interface ModeloNoBanco { id: string; service_type: string; clauses: Clausula[]; updated_at: string }

/**
 * O SQL que aplica a revisão nos modelos exportados de contract_templates. Pura.
 *
 * Tudo ou nada, e só por cima da versão exportada: cada UPDATE confere o `updated_at` lido; se alguém
 * salvou pela tela no meio do caminho, a transação inteira desfaz. Modelo vazio (design) ou já revisado
 * fica de fora. Lança se o resultado ainda tiver problema — não gera SQL de modelo torto.
 */
export function sqlDaRevisao(modelos: ModeloNoBanco[]): string {
  const linhas: string[] = [];
  modelos.forEach((m, i) => {
    if (!m.clauses?.length) return;
    const novo = revisarModelo(m.service_type, m.clauses);
    if (JSON.stringify(novo) === JSON.stringify(m.clauses)) return;
    const problemas = conferirModelo(m.service_type, novo);
    if (problemas.length) throw new Error(`${m.service_type}: ${problemas.map((p) => p.problema).join("; ")}`);
    const tag = `$m${i}$`;
    const json = JSON.stringify(novo);
    if (json.includes(tag)) throw new Error(`${m.service_type}: texto contém ${tag}`);
    linhas.push(
      `  update contract_templates set clauses = ${tag}${json}${tag}::jsonb, updated_at = now()`,
      `   where id = '${m.id.replace(/'/g, "")}' and updated_at = '${m.updated_at.replace(/'/g, "")}';`,
      `  get diagnostics n = row_count;`,
      `  if n <> 1 then raise exception 'modelo ${m.service_type} mudou depois da exportação — nada foi gravado'; end if;`,
    );
  });
  if (!linhas.length) return "";
  return ["do $revisao$", "declare n int;", "begin", ...linhas, "end", "$revisao$;", ""].join("\n");
}

