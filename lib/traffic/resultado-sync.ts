// lib/traffic/resultado-sync.ts — o `ok` da conferência de saldo (cron de 2 em 2h). Puro.
//
// 25/10/2026 (auditoria 9.10): a rota respondia `ok: true` mesmo com TODAS as contas em erro (token sem
// permissão, Meta fora), e a Central de Automações mostrava verde. Conta isolada com erro é do dia a dia
// (cliente tirou o acesso) e aparece em `com_erro`; todas falhando é a rotina que não funcionou.

export function resultadoDoSync(r: {
  total: number;
  errors: number;
  accounts: { clientName: string; alert: { severity: string; reason: string } }[];
}): { ok: boolean; erro?: string } {
  if (r.total === 0 || r.errors < r.total) return { ok: true };
  const motivos = [...new Set(r.accounts.filter((a) => a.alert.severity === "error").map((a) => a.alert.reason))];
  const motivo = motivos.length ? motivos.slice(0, 2).join("; ") : "sem resposta da Meta";
  return { ok: false, erro: `Nenhuma das ${r.total} contas foi lida (${motivo}). Confira a Conexão Meta.` };
}
