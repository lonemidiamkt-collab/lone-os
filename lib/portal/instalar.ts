// lib/portal/instalar.ts — "Adicionar à tela inicial" do Painel de Resultados (19/11/2026, Leva 4).
//
// O Android (Chrome) avisa a página quando dá para instalar e a própria página pode abrir o convite.
// O iPhone não avisa nada: só instala pelo Safari, pelo menu Compartilhar — e o link que chega pelo
// WhatsApp muitas vezes abre em outro navegador, onde essa opção não existe. Aqui decidimos o que dizer.

/** O que mostrar no iPhone/iPad. No Android quem manda é o evento do navegador (ver PortalInstalar). */
export type ModoNoIphone =
  | "safari"   // dá para instalar: Compartilhar → Adicionar à Tela de Início
  | "outro"    // iPhone, mas em outro navegador ou dentro de um aplicativo: precisa abrir no Safari
  | "nenhum";  // não é iPhone/iPad, ou o painel já está instalado

/** Navegadores e aplicativos do iPhone que não são o Safari (cada um põe a própria marca no user agent). */
const NAO_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|MicroMessenger/i;

export function modoNoIphone(ua: string, onde: { instalado: boolean; pontosDeToque?: number }): ModoNoIphone {
  if (onde.instalado) return "nenhum";
  // iPad moderno se apresenta como Mac: o que o entrega é a tela de toque.
  const ehIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (onde.pontosDeToque ?? 0) > 1);
  if (!ehIos) return "nenhum";
  // Safari de verdade traz "Version/x" e "Safari/"; aplicativo com navegador embutido costuma não trazer.
  const ehSafari = /Safari\//.test(ua) && /Version\//.test(ua) && !NAO_SAFARI.test(ua);
  return ehSafari ? "safari" : "outro";
}

/** Onde guardamos que o cliente tocou em "Agora não" (por aparelho). */
export const CHAVE_DISPENSADO = "portal-instalar-dispensado";
