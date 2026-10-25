export const runtime = "nodejs"; // crypto nativo precisa Node
export const dynamic = "force-dynamic";

// GET /api/client-vault/anteriores?clientId=…&field=instagram_password
//   → { disponivel, versoes: [{ id, em, quem, motivo }] }   (lista SEM a senha)
// GET /api/client-vault/anteriores?clientId=…&field=…&versaoId=…
//   → { value }                                             (revela UMA versão; fica registrado)
//
// 25/10/2026 (onda 5 da auditoria de erro recuperável): as senhas guardadas a cada troca
// (cofre_senhas_anteriores, onda 2, item 3.5) só eram alcançáveis pelo "Desfazer" de ~15 s do aviso.
// Agora a ficha lista as anteriores por campo. Só ADMIN (a mesma regra do POST de /api/client-vault,
// que é quem restaura). "Ver" é registrado em vault_access_log como o revelar da senha atual — aparece
// na trilha "Quem revelou ou alterou" da ficha. Restaurar continua sendo a ação `restaurar` de
// /api/client-vault. Nunca loga senha: só campo, id da versão e o motivo do erro.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { nomesPorEmail } from "@/lib/equipe/email";
import { getServerUser } from "@/lib/supabase/auth-server";
import { decryptVault } from "@/lib/crypto/vault";
import { registrarAcessoCofre } from "@/lib/cofre/registro-acesso";
import { CAMPOS_COM_HISTORICO, MAX_VERSOES, montarVersoes, tabelaAusente, type LinhaVersao } from "@/lib/cofre/senhas-anteriores";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Só administrador vê as senhas anteriores." }, { status: 403 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  const field = url.searchParams.get("field") ?? "";
  const versaoId = url.searchParams.get("versaoId");
  if (!UUID.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  if (!CAMPOS_COM_HISTORICO.has(field)) return NextResponse.json({ error: `Campo '${field}' sem histórico de senha.` }, { status: 400 });

  // ── Revelar uma versão ────────────────────────────────────────────────────
  if (versaoId) {
    if (!UUID.test(versaoId)) return NextResponse.json({ error: "Versão inválida." }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("cofre_senhas_anteriores")
      .select("valor_cifrado")
      .eq("id", versaoId).eq("client_id", clientId).eq("tabela", "clients").eq("campo", field)
      .maybeSingle();
    if (error) {
      console.error("[client-vault/anteriores] leitura da versão falhou:", field, versaoId, error.message);
      return NextResponse.json({ error: "Não consegui ler a senha anterior agora. Tente de novo." }, { status: 503 });
    }
    if (!data) return NextResponse.json({ error: "Essa versão da senha não existe mais." }, { status: 404 });
    let value: string | null;
    try {
      value = decryptVault(data.valor_cifrado as string);
    } catch {
      console.error("[client-vault/anteriores] cifra inválida na versão:", field, versaoId);
      return NextResponse.json({ error: "Não consegui abrir esta senha guardada (cifra inválida)." }, { status: 500 });
    }
    await registrarAcessoCofre({ user, clientId, field, action: "reveal", req, caminho: `cofre_senhas_anteriores/${versaoId}` });
    return NextResponse.json({ value }, { headers: SEM_CACHE });
  }

  // ── Listar (sem a senha) ──────────────────────────────────────────────────
  const { data, error } = await supabaseAdmin.from("cofre_senhas_anteriores")
    .select("id, motivo, trocado_por_id, trocado_por_email, trocado_em")
    .eq("client_id", clientId).eq("tabela", "clients").eq("campo", field)
    .order("trocado_em", { ascending: false })
    .limit(MAX_VERSOES);
  if (error) {
    if (tabelaAusente(error)) return NextResponse.json({ disponivel: false, versoes: [] }, { headers: SEM_CACHE });
    console.error("[client-vault/anteriores] lista falhou:", field, error.message);
    return NextResponse.json({ error: "Não consegui ler as senhas anteriores agora. Tente de novo." }, { status: 503 });
  }
  const linhas = (data ?? []) as unknown as LinhaVersao[];

  // Nome de quem trocou. A tabela guarda o id de login e o e-mail; a equipe NÃO tem `auth_id` (25/10/2026,
  // onda 6, item 8.12 — a busca por essa coluna falhava e todo mundo aparecia pelo e-mail). O elo é o e-mail,
  // sem diferença de maiúsculas. A equipe é pequena: lê inteira. Sem conseguir ler, fica o e-mail.
  let nomes = new Map<string, string>();
  if (linhas.some((l) => l.trocado_por_email)) {
    const { data: equipe, error: eEquipe } = await supabaseAdmin.from("team_members").select("email, name");
    if (eEquipe) console.warn("[client-vault/anteriores] nomes da equipe não lidos:", eEquipe.message);
    else nomes = nomesPorEmail(equipe as Array<{ email?: unknown; name?: unknown }>);
  }
  return NextResponse.json({ disponivel: true, versoes: montarVersoes(linhas, nomes) }, { headers: SEM_CACHE });
}
