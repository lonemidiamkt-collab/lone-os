// lib/empresa/receita-server.ts — a consulta à BrasilAPI (server-only). As contas ficam em ./receita.ts.

import { empresaDaBrasilApi, cnpjValido, type EmpresaReceita } from "./receita";

export type ResultadoConsulta =
  | { ok: true; empresa: EmpresaReceita; doCache: boolean }
  | { ok: false; status: 400 | 404 | 503; motivo: string };

const UM_DIA = 24 * 60 * 60 * 1000;
const CACHE = new Map<string, { em: number; empresa: EmpresaReceita }>();

/**
 * GET brasilapi.com.br/api/cnpj/v1/{cnpj}. Cache de 24h por CNPJ: o cliente digita, apaga e digita
 * de novo, e o dado da Receita não muda de um minuto para o outro. A BrasilAPI é gratuita e sem
 * garantia — fora do ar, a tela pede o preenchimento à mão em vez de travar o cadastro.
 */
export async function consultarCnpj(cnpjBruto: string): Promise<ResultadoConsulta> {
  const cnpj = cnpjBruto.replace(/\D/g, "");
  if (!cnpjValido(cnpj)) return { ok: false, status: 400, motivo: "CNPJ inválido: confira os números." };

  const guardado = CACHE.get(cnpj);
  if (guardado && Date.now() - guardado.em < UM_DIA) return { ok: true, empresa: guardado.empresa, doCache: true };

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: "application/json", "User-Agent": "LoneOS/1.0 (cadastro de cliente)" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (r.status === 404 || r.status === 400) {
      return { ok: false, status: 404, motivo: "Não encontramos esse CNPJ na Receita. Confira os números ou preencha os dados à mão." };
    }
    if (!r.ok) {
      console.error("[receita] BrasilAPI respondeu", r.status, "para", cnpj.slice(0, 8));
      return { ok: false, status: 503, motivo: "A consulta à Receita está fora do ar agora. Preencha os dados à mão; nada se perde." };
    }
    const empresa = empresaDaBrasilApi((await r.json()) as Record<string, unknown>);
    CACHE.set(cnpj, { em: Date.now(), empresa });
    return { ok: true, empresa, doCache: false };
  } catch (e) {
    console.error("[receita] consulta falhou:", cnpj.slice(0, 8), e instanceof Error ? e.message : e);
    return { ok: false, status: 503, motivo: "A consulta à Receita demorou demais. Preencha os dados à mão; nada se perde." };
  }
}
