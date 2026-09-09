// O LINK QUE O NAVEGADOR CONSEGUE ABRIR.
//
// `supabaseAdmin` fala com o Supabase pelo hostname INTERNO do Docker
// (`SUPABASE_INTERNAL_URL=http://supabase-kong-1:8000`) — que é o certo para o servidor. Mas
// `createSignedUrl` devolve uma URL construída sobre essa mesma base, e o navegador de quem clica
// não resolve `supabase-kong-1`: dá DNS_PROBE_FINISHED_NXDOMAIN.
//
// Roberto (09/09) clicou no primeiro anexo que salvou e caiu nessa tela.
//
// A reescrita já existia numa rota, escrita à mão, e as outras quatro que geram link não a
// tinham. Uma correção copiada em um lugar de cinco não é correção — é sorte. Aqui é uma só.

/**
 * Troca a base interna pela pública, quando a URL veio com ela.
 *
 * Devolve `null` para entrada nula, para o chamador poder encadear sem checar antes.
 */
export function paraUrlPublica(url: string | null | undefined): string | null {
  if (!url) return null;
  const interna = process.env.SUPABASE_INTERNAL_URL ?? "";
  const publica = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Sem uma das duas configuradas, devolve como veio: reescrever pela metade produziria um link
  // pior que o original.
  if (!interna || !publica || !url.startsWith(interna)) return url;
  return publica + url.slice(interna.length);
}
