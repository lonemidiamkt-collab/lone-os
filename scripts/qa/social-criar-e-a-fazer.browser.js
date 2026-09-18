export default async function ({ page }) {
  const out = { passos: [], reqs: [], log: [] };
  const passo = (n, d) => out.passos.push({ n, t: Date.now(), ...d });
  page.on("console", (m) => { if (["error","warning"].includes(m.type())) out.log.push(m.type() + ": " + m.text().slice(0, 200)); });
  page.on("pageerror", (e) => out.log.push("PAGEERROR: " + String(e).slice(0, 200)));
  page.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && !/content\?v=|notifications|roster|team-member|holidays|preferences|defense|erro-cliente/.test(u)) out.reqs.push(`${new Date().toISOString().slice(11,19)} ${r.request().method()} ${u.replace("https://painel.lonemidia.com","").slice(0,70)} → ${r.status()}`); });
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("https://painel.lonemidia.com/login", { waitUntil: "networkidle2", timeout: 60000 });
  await esperar(2000);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Selecione um usu/i.test(x.innerText)); if (b) b.click(); });
  await esperar(700);
  await page.evaluate(() => { const el = [...document.querySelectorAll("button")].find((x) => /QA Social/i.test(x.innerText || "")); if (el) el.click(); });
  await esperar(800);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.type('input[type="password"]', "__PASS__");
  await page.keyboard.press("Enter");
  await esperar(4000);
  for (let i = 0; i < 3; i++) { const p = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^pular$/i.test(x.innerText.trim())); if (b) { b.click(); return true; } return false; }); if (!p) break; await esperar(600); }
  passo("login", { url: page.url() });
  // navegação CLIENT-SIDE para /social (como o usuário: clique no menu)
  // conta de QA não é redirecionada após o login (fica em /login com 404 do shell); vai direto — a
  // restauração de sessão agora espera o roster, então o reload mantém o login.
  await page.goto("https://painel.lonemidia.com/social", { waitUntil: "networkidle2", timeout: 60000 });
  await esperar(3000);
  for (let i = 0; i < 3; i++) { const p = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^pular$/i.test(x.innerText.trim())); if (b) { b.click(); return true; } return false; }); if (!p) break; await esperar(600); }
  // vai para a aba Kanban (onde o social trabalha e onde o card aparece)
  const aba = await page.evaluate(() => { const b = [...document.querySelectorAll("button, a")].find((x) => /^board\b/i.test(x.innerText.trim()) && x.tagName === "BUTTON"); if (b) { b.click(); return b.innerText.trim(); } return [...document.querySelectorAll("button, a")].map((x) => x.innerText.trim()).filter((t) => t && t.length < 25).slice(0, 40); });
  await esperar(2500);
  const nav = { goto: true, aba };
  passo("social", { nav, url: page.url(), tem: await page.evaluate(() => /Novo Conte/i.test(document.body.innerText)) });
  // abre Novo Conteúdo
  const abriu = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /novo conte/i.test(x.innerText)); if (b) { b.click(); return true; } return false; });
  await esperar(1500);
  const titulo = "QA REPRO " + Date.now().toString(36);
  const preench = await page.evaluate((titulo) => {
    const d = document.querySelector('[role="dialog"]'); if (!d) return "sem dialog";
    const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(el.__proto__, "value").set; p.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    const inputs = [...d.querySelectorAll("input")];
    const tit = inputs.find((i) => /t[ií]tulo/i.test(i.placeholder + i.id + i.name + (i.getAttribute("aria-label") || ""))) || inputs.find((i) => i.type === "text") || inputs[0];
    if (tit) set(tit, titulo);
    const sel = d.querySelector("select"); let cli = null;
    if (sel) { const opt = [...sel.options].find((o) => /Agente CS/i.test(o.text)) || [...sel.options].find((o) => o.value && !/selecione/i.test(o.text)); if (opt) { set(sel, opt.value); cli = opt.text; } }
    const data = inputs.find((i) => i.type === "date"); if (data) set(data, "2026-09-25");
    const hora = inputs.find((i) => i.type === "time"); if (hora) set(hora, "10:00");
    return { cliente: cli, campos: inputs.map((i) => i.type + ":" + (i.placeholder || i.id || "")).slice(0, 10), aviso: (d.innerText.match(/Falta preencher[^\n]*/) || [""])[0] };
  }, titulo);
  await esperar(500);
  // REDE LENTA + BUSCA EM VOO: como a equipe volta do WhatsApp — o foco dispara a busca (800 KB, lenta) e a pessoa clica no meio dela
  const cdp = await page.target().createCDPSession();
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 800, downloadThroughput: 150 * 1024, uploadThroughput: 80 * 1024 });
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); });
  await esperar(300);
  const clicou = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const b = d && [...d.querySelectorAll("button")].find((x) => /criar conte/i.test(x.innerText)); if (!b) return "sem botao"; if (b.disabled) return "desabilitado"; b.click(); return "clicou"; });
  passo("novo-conteudo", { abriu, preench, clicou });
  await esperar(5000);
  const inspecionar = (titulo) => ({
    modalAberto: !!document.querySelector('[role="dialog"]'),
    cardNaTela: document.body.innerText.includes(titulo),
    abaAtiva: [...document.querySelectorAll("button")].filter((b) => /border-primary|text-primary/.test(b.className) && b.innerText.trim().length < 30).map((b) => b.innerText.trim()).slice(0, 6),
    colunas: [...document.querySelectorAll("h3, h4")].map((h) => h.innerText.trim()).filter((t) => t && t.length < 40).slice(0, 14),
    ideiasTexto: (document.body.innerText.split(/Ideias|A fazer/i)[1] || "").slice(0, 200),
    contagemQA: (document.body.innerText.match(/QA REPRO/g) || []).length,
    toasts: [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.slice(0, 120)),
  });
  const aposCriar = await page.evaluate(inspecionar, titulo);
  passo("apos-criar-5s", aposCriar);
  // clica "A fazer" no card recém-criado, UMA vez
  const acharBotao = (titulo) => {
    const bs = [...document.querySelectorAll("button")].filter((x) => /^\s*a fazer\s*$/i.test(x.innerText));
    for (const b of bs) { let el = b; for (let i = 0; i < 10 && el; i++) { el = el.parentElement; if (el && el.textContent.includes(titulo) && el.getBoundingClientRect().height < 600) return b; } }
    return null;
  };
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); });
  await esperar(300);
  const afazer = await page.evaluate((titulo) => {
    const bs = [...document.querySelectorAll("button")].filter((x) => /^\s*a fazer\s*$/i.test(x.innerText));
    let alvo = null;
    for (const b of bs) { let el = b; for (let i = 0; i < 10 && el; i++) { el = el.parentElement; if (el && el.textContent.includes(titulo) && el.getBoundingClientRect().height < 600) { alvo = b; break; } } if (alvo) break; }
    if (!alvo) return "botao A fazer nao achado (botoes A fazer na tela: " + bs.length + ")";
    alvo.click(); return "clicou";
  }, titulo);
  await esperar(4000);
  const estadoCard = (titulo) => {
    const spans = [...document.querySelectorAll("span, button")].filter((x) => /a fazer/i.test(x.innerText || ""));
    for (const sp of spans) { let el = sp; for (let i = 0; i < 10 && el; i++) { el = el.parentElement; if (el && el.textContent.includes(titulo) && el.getBoundingClientRect().height < 600) return { naFila: /na fila/i.test(sp.innerText), botaoAinda: sp.tagName === "BUTTON", texto: sp.innerText.trim() }; } }
    return { naFila: false, botaoAinda: false, texto: "(nada com A fazer perto do card)" };
  };
  const aposAfazer = await page.evaluate((titulo) => {
    const spans = [...document.querySelectorAll("span, button")].filter((x) => /a fazer/i.test(x.innerText || ""));
    for (const sp of spans) { let el = sp; for (let i = 0; i < 10 && el; i++) { el = el.parentElement; if (el && el.textContent.includes(titulo) && el.getBoundingClientRect().height < 600) return { naFila: /na fila/i.test(sp.innerText), botaoAinda: sp.tagName === "BUTTON", texto: sp.innerText.trim(), toasts: [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.slice(0, 140)) }; } }
    return { naFila: false, botaoAinda: false, texto: "(nada)", toasts: [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.slice(0, 140)) };
  }, titulo);
  passo("a-fazer", { afazer, ...aposAfazer });
  await esperar(12000);
  passo("a-fazer-20s", await page.evaluate((titulo) => {
    const spans = [...document.querySelectorAll("span, button")].filter((x) => /a fazer/i.test(x.innerText || ""));
    for (const sp of spans) { let el = sp; for (let i = 0; i < 10 && el; i++) { el = el.parentElement; if (el && el.textContent.includes(titulo) && el.getBoundingClientRect().height < 600) return { naFila: /na fila/i.test(sp.innerText), botaoAinda: sp.tagName === "BUTTON", texto: sp.innerText.trim() }; } }
    return { naFila: false, botaoAinda: false, texto: "(nada)" };
  }, titulo));
  out.titulo = titulo;
  return out;
}
