// types/pdf-parse.d.ts — a lib não traz tipos e não existe @types oficial.
//
// Declaro o módulo INTERNO (`lib/pdf-parse.js`) porque é ele que a gente importa: o index.js tem
// um modo de depuração que lê um PDF de teste do próprio pacote quando empacotado, e quebra em
// produção com um erro que parece ser do arquivo do cliente.
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(
    data: Buffer,
    options?: { max?: number },
  ): Promise<{ text: string; numpages: number; info?: unknown }>;
  export default pdfParse;
}
declare module "pdf-parse" {
  function pdfParse(
    data: Buffer,
    options?: { max?: number },
  ): Promise<{ text: string; numpages: number; info?: unknown }>;
  export default pdfParse;
}
