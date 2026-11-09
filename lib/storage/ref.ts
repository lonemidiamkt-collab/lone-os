// lib/storage/ref.ts — de uma referência de arquivo guardada no banco para { bucket, path } do Storage.
// Módulo PURO. Saiu de dentro de app/api/storage/signed-url (09/11/2026) porque a pasta do Drive do
// cliente (lib/drive/sincronizar-pasta.ts) precisa baixar os MESMOS arquivos pela mesma regra.
//
// Formas aceitas:
//   - "legal://<path>"                                   → legal-docs
//   - ".../storage/v1/object/public|sign/<bucket>/<p>"   → <bucket> (URLs legadas e o logo público)
//   - "<bucket>://<path>"                                → <bucket>
//   - "<path>" cru (sem prefixo)                         → bucketHint ou legal-docs (compat)

export function resolveRef(raw: string, bucketHint?: string): { bucket: string; path: string } {
  if (raw.startsWith("legal://")) return { bucket: "legal-docs", path: raw.slice("legal://".length) };
  const urlMatch = raw.match(/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (urlMatch) return { bucket: urlMatch[1], path: decodeURIComponent(urlMatch[2].split(/[?#]/)[0]) };
  const protoMatch = raw.match(/^([a-z0-9][a-z0-9-]*):\/\/(.+)$/i);
  if (protoMatch) return { bucket: protoMatch[1] === "legal" ? "legal-docs" : protoMatch[1], path: protoMatch[2] };
  return { bucket: bucketHint || "legal-docs", path: raw };
}
