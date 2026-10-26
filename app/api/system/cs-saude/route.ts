export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd } from "@/lib/cs/vigilancia";

const primeiroNome = (n: string) => (n || "").trim().split(/\s+/)[0] || n;
import { clientesSemPostar, clientesSemInstagram, clientesIlegiveis, instagramDuplicado, textoCobranca as cobrancaSemPostar, textoEscalada as escaladaSemPostar } from "@/lib/cs/sem-postar";
import { saudePessoaPdfHtml, legendaSaude, ordenar, type BlocoSaude, type ClienteSaude } from "@/lib/reports/saudePdf";

// POST /api/system/cs-saude — POSTAGEM NO INSTAGRAM POR PESSOA (segunda 11h, `0 14 * * 1`). ?dry=1 não posta.
//
// Quem está sem postar (medido no Instagram do cliente) e o que falta no cadastro do Instagram (sem conta
// vinculada, conta que não conseguimos ler, mesmo Instagram em dois cadastros), um PDF por responsável.
//
// UM MOTOR DE RISCO SÓ (26/10/2026, semana 1 do plano de agentes). Até aqui esta rotina também julgava
// "risco" com um cálculo próprio (reclamação e retração em 14 dias), e toda segunda o grupo recebia
// "clientes pedindo atenção" duas vezes, com duas réguas diferentes: às 9h30 pelo cs-risco-semanal (nota de
// saúde, escritor único /api/scores) e às 11h por aqui. Reclamação e retração já entram na nota de saúde
// (sentimento e relacionamento), então o julgamento de risco saiu daqui: risco é só a nota de saúde,
// no aviso das 9h30. Esta rotina ficou com o que só ela faz.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  // Clientes ativos (em operação), sem o cliente-teste. Filtro de `active` obrigatório: cliente
  // arquivado/churnado mantém o status antigo e aparecia toda segunda como risco 🔴.
  const { data: clientsData } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, status, active, assigned_social")
    .in("status", ["good", "average", "at_risk"])
    .or("active.is.null,active.eq.true")
    .not("name", "ilike", "%(teste)%");
  const clientes = clientsData ?? [];

  // Sinais em batch.
  //
  // ── "DIAS SEM POSTAR" VEM DO INSTAGRAM, NUNCA DO BOARD ──────────────────
  //
  // Até 02/09 esta consulta lia `content_cards.status = 'published'` e o resultado ia direto para
  // a mensagem que o time recebia toda manhã. O board está defasado por construção — em agosto
  // marcou 24 publicações contra 451 posts reais —, então o digest saía dizendo coisas como
  // "Madeirão Madeira, 56 dias sem postagem" de um cliente que tinha postado 5 dias antes.
  //
  // Medido no dia da correção: de 37 clientes de social, **16 eram acusados à toa** e outros 9
  // não tinham registro nenhum no board estando ativos no Instagram. O Roberto pegou dois deles
  // ("Varejão e UNAFER foi feito post sim!") e a conferência na Meta deu razão a ele em todos.
  //
  // `client_ig_posts` é lido do Instagram do cliente e bate com a Meta — conferido post a post.
  // Conta que POSTA e não conseguimos ler. Marcada como pendência de ACESSO — jamais como "não
  // postou". Foi o erro no Varejão (138 posts) e no UNAFER (124) que o Roberto pegou.
  const cegos = await clientesIlegiveis();
  // Mesmo Instagram em dois cadastros: os posts caem em um e o outro parece parado.
  const duplicados = await instagramDuplicado();

  const now = spNow();
  // CLIENTE SEM POSTAR — pelos posts REAIS do Instagram, não pelo status do quadro. O medidor
  // antigo dependia do time mover card pra "publicado" (ninguém move) e ignorava quem não tinha
  // NENHUM post — foi assim que o Bazar Ribeiro passou 35 dias invisível.
  const parados = await clientesSemPostar();
  // Cliente de social SEM Instagram vinculado: o sistema é cego pra ele. É problema de cadastro,
  // não de postagem — vai num aviso curto e à parte, pra não acusar o social de algo que não é
  // dele e queimar a credibilidade da cobrança de verdade.
  const semIg = await clientesSemInstagram();
  const txtParados = [
    cobrancaSemPostar(parados),
    semIg.length ? `👁️ _Sem Instagram vinculado (não consigo conferir postagem): ${semIg.slice(0, 6).map((c) => c.cliente).join(", ")}${semIg.length > 6 ? ` e mais ${semIg.length - 6}` : ""}._` : "",
  ].filter(Boolean).join("\n\n");
  const txtEscalada = escaladaSemPostar(parados);

  // ── UM PDF POR RESPONSÁVEL ─────────────────────────────────────────────
  //
  // Roberto (02/09): "essa mensagem quero separado em pdf por pessoa que é responsável".
  //
  // A mensagem antiga trazia 17 clientes em risco num bloco SEM dono nenhum, e logo abaixo outra
  // lista com dono — dois formatos para o mesmo problema, e ninguém sabendo o que era seu. Aqui
  // as duas viram uma carteira só, por pessoa, ordenada do pior para o melhor.
  const porPessoa = new Map<string, ClienteSaude[]>();
  const push = (dono: string | null, c: ClienteSaude) => {
    const k = dono?.trim() || "sem dono";
    (porPessoa.get(k) ?? porPessoa.set(k, []).get(k)!).push(c);
  };

  // Fonte 1: os parados de verdade, medidos no Instagram do cliente.
  const nomesParados = new Set<string>();
  for (const p of parados) {
    nomesParados.add(p.cliente);
    push(p.responsavel, { cliente: p.cliente, diasSemPostar: p.diasSemPostar, motivos: [] });
  }
  // (A antiga "fonte 2", risco por reclamação/retração com régua própria, saiu: risco é só a nota de
  // saúde, no aviso das 9h30 — ver o topo do arquivo.)
  // Fonte 3: cadastro incompleto. Vai no PDF do dono, mas marcado como problema de cadastro —
  // cobrar postagem de quem o sistema não consegue ler seria acusar pelo que não é dele.
  for (const c of semIg) {
    if (nomesParados.has(c.cliente)) continue;
    push(c.responsavel, { cliente: c.cliente, diasSemPostar: null, motivos: [], semInstagram: true });
  }
  // Fonte 4: conta com publicações que não enxergamos. Entra com o NÚMERO de posts, que é a prova
  // de que o cliente trabalhou — e a razão de isso não ser cobrança de ninguém.
  for (const c of cegos) {
    if (nomesParados.has(c.cliente)) continue;
    push(c.responsavel, { cliente: c.cliente, motivos: [], ilegivel: { postsNaConta: c.postsNaConta } });
  }
  // Fonte 5: cadastro duplicado. Nomear o outro cliente é o que torna isso resolvível.
  for (const c of clientes) {
    const outros = duplicados.get(c.id as string);
    if (!outros?.length) continue;
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    if (nomesParados.has(nome)) continue;
    push((c.assigned_social as string) || null, { cliente: nome, motivos: [], contaDividida: outros });
  }

  const blocos: BlocoSaude[] = [...porPessoa.entries()]
    .map(([pessoa, cs]) => ({ pessoa: pessoa === "sem dono" ? "Sem dono (falta atribuir)" : primeiroNome(pessoa), pessoaOriginal: pessoa, clientes: ordenar(cs) }))
    .sort((a, b) => {
      const pior = (b2: BlocoSaude) => { const c = b2.clientes.find((x) => !x.semInstagram); return c ? (c.diasSemPostar ?? 9999) : -1; };
      return pior(b) - pior(a);
    });

  // ?baixar=1[&pessoa=Nome] devolve o PDF sem enviar nada. O mesmo parâmetro já pegou "0.0105
  // dias" no relatório de saldos antes do documento chegar ao grupo — conferir antes é barato.
  if (req.nextUrl.searchParams.get("baixar") === "1") {
    const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
    const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
    const logo = await loadLoneLogo().catch(() => "");
    const soDe = req.nextUrl.searchParams.get("pessoa");
    const alvo = soDe ? blocos.filter((b) => b.pessoa.toLowerCase().includes(soDe.toLowerCase())) : blocos;
    if (!alvo.length) return NextResponse.json({ error: `ninguém com "${soDe}"` }, { status: 404 });
    const { saudePdfHtml } = await import("@/lib/reports/saudePdf");
    const html = soDe && alvo.length === 1
      ? saudePessoaPdfHtml(alvo[0], logo, ymd(now))
      : saudePdfHtml(alvo, logo, ymd(now));
    const pdf = await htmlToPdf(html);
    if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error }, { status: 500 });
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="saude.pdf"' },
    });
  }

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let enviado = false;
  const pdfsEnviados: string[] = [];
  const falhas: string[] = [];

  if (!dry && internalJid && blocos.length) {
    const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
    const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
    const { csSendGroupDocument } = await import("@/lib/cs/notify");
    const { mencionar } = await import("@/lib/cs/mencao");
    const logo = await loadLoneLogo().catch(() => "");
    const hojeIso = ymd(now);
    const dataArquivo = hojeIso.split("-").reverse().join("-");

    for (const b of blocos as (BlocoSaude & { pessoaOriginal: string })[]) {
      const m = b.pessoaOriginal === "sem dono"
        ? { trecho: "", jids: [] as string[] }
        : await mencionar(b.pessoaOriginal).catch(() => ({ trecho: "", jids: [] as string[] }));
      const arquivo = `Saúde ${b.pessoa.replace(/[^\p{L}\p{N} -]/gu, "").trim() || "carteira"} — ${dataArquivo}.pdf`;
      const legenda = legendaSaude(b, m.trecho);
      try {
        const pdf = await htmlToPdf(saudePessoaPdfHtml(b, logo, hojeIso));
        if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");
        const envio = await csSendGroupDocument(
          internalJid, pdf.buffer.toString("base64"), arquivo, legenda, "application/pdf", m.jids,
        );
        if (!envio.ok) throw new Error(envio.error ?? "envio falhou");
        pdfsEnviados.push(b.pessoa);
      } catch (e) {
        // Cobrança que some porque o render caiu é pior que cobrança feia: manda o texto.
        falhas.push(`${b.pessoa}: ${String(e).slice(0, 60)}`);
        await csSendGroupText(internalJid, legenda, undefined, { origem: "cs-saude", destino: "interno" }, m.jids).catch(() => {});
      }
      // Respiro entre documentos: a fila da Evolution engasga com envios colados.
      await new Promise((r) => setTimeout(r, 1500));
    }
    enviado = pdfsEnviados.length > 0;
  }

  // O GRAVE VAI SEPARADO PRO DONO. Misturado no digest do time, "35 dias sem postar" tem o mesmo
  // peso de "responder ok/não" — e foi exatamente assim que passou despercebido.
  const jidDono = process.env.CS_OWNER_JID || null;
  let escalado = false;
  if (!dry && jidDono && txtEscalada) {
    const r = await csSendGroupText(jidDono, txtEscalada, undefined, { origem: "cs-saude-escalada", destino: "interno" });
    escalado = r.ok;
  }

  console.log(`[cs-saude] clientes=${clientes.length} semPostar=${parados.length} escalado=${escalado} dry=${dry}`);
  return NextResponse.json({
    ok: true, dry, enviado, escalado, clientes: clientes.length,
    pdfs_enviados: pdfsEnviados, falhas,
    por_pessoa: blocos.map((b) => ({ pessoa: b.pessoa, clientes: b.clientes.length })),
    semPostar: parados.length, semInstagram: semIg.length, semAcessoIg: cegos.length,
    ig_duplicado: [...duplicados.entries()].length,
    detalhe_sem_acesso: cegos.map((c) => `${c.cliente} (@${c.usuario ?? "?"}, ${c.postsNaConta} posts)`), textoSemPostar: txtParados, textoEscalada: txtEscalada,
  });
}
