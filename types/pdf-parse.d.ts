// types/pdf-parse.d.ts — a lib não traz tipos e não existe @types oficial.
// Declaro só o que a gente usa: buffer entra, texto e número de páginas saem.
declare module "pdf-parse" {
  function pdfParse(
    data: Buffer,
    options?: { max?: number },
  ): Promise<{ text: string; numpages: number; info?: unknown }>;
  export default pdfParse;
}
