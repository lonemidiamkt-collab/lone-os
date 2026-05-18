# PDF Generation — Lone OS

## Visão geral

O sistema tem dois mecanismos distintos de geração de PDF:

| Mecanismo | Arquivo | Usado por |
|---|---|---|
| jsPDF + html2canvas | `lib/htmlToPdf.ts` | Relatórios de tráfego (interno e cliente) |
| Browser print dialog | `lib/exportPdf.ts` | Relatório Quinzenal (clientes), Social, CEO |
| @react-pdf/renderer | `lib/contracts/templates.tsx` | Contratos |
| @react-pdf/renderer | `lib/holidays/pdf*.tsx` | Calendário de feriados |

---

## lib/htmlToPdf.ts — jsPDF + html2canvas

### Como funciona

1. Renderiza o HTML num `<iframe>` oculto (largura fixa 860px)
2. Aguarda 900ms para fontes e imagens carregarem
3. Captura com `html2canvas` (scale 2x, `backgroundColor: #060814`)
4. Gera o PDF via jsPDF no modo escolhido (ver abaixo)

### Modos de geração

#### Modo padrão — altura dinâmica (sem `multiPage`)

```ts
await htmlToPdfBlob(html)
await downloadAsPdf(html, filename)
```

- Página única com largura A4 (210mm) e **altura igual ao conteúdo**
- Sem borda branca na parte inferior
- Ideal para relatórios cliente-facing que variam em tamanho
- Não adequado para impressão direta (página pode ser muito alta)

**Quando usar:** `exportClientReportPdf`, `exportAllTrafficReportsZip`, qualquer novo
relatório personalizado por cliente.

#### Modo multiPage — A4 com paginação

```ts
await htmlToPdfBlob(html, { multiPage: true })
await downloadAsPdf(html, filename, { multiPage: true })
```

- Páginas fixas A4 (210mm × 297mm)
- `avoidPageBreaks` insere espaçadores para evitar elementos cortados na virada de página
- Última página pode ter borda branca se conteúdo não preenche exatamente o A4
- Adequado para impressão e relatórios longos

**Quando usar:** `exportTrafficReportPdf` (relatório interno 7d).

### Por que altura dinâmica em vez de A4 fixo

O jsPDF cria a página com tamanho fixo. Se o conteúdo capturado pelo
`html2canvas` for menor que 297mm, `addImage` coloca a imagem no topo e
o restante da página fica em branco. Isso criava uma borda branca visível
em relatórios personalizados de clientes com poucos dados.

A solução (`format: [210, imgHeight]`) ajusta a altura da página ao
conteúdo exato. O PDF fica menor, sem espaço em branco — correto para
visualização em tela e para envio ao cliente.

### backgroundColor obrigatório

O iframe não herda o dark mode da aplicação. Sem `backgroundColor` explícito,
o `html2canvas` captura o fundo como transparente, que renderiza branco em
Safari e em alguns ambientes de impressão. O valor `#060814` é a cor base
da identidade visual dos relatórios.

---

## lib/exportPdf.ts — browser print dialog

Abre uma janela com HTML pré-estilizado. O usuário clica "Salvar como PDF"
ou usa Ctrl/Cmd+P. Não usa jsPDF — depende do driver de impressão do browser.

Limitações:
- Margens e tamanho de página controlados pelo browser/impressora
- Não gera Blob programaticamente (não serve para ZIP)
- Qualidade de cor depende das configurações do browser (necessita `print-color-adjust: exact`)

---

## Adicionando um novo tipo de relatório PDF

### Se o relatório é página única ou de tamanho variável (cliente-facing):

```ts
import { downloadAsPdf } from "@/lib/htmlToPdf";

export async function exportMeuRelatorio(data: MeuDadoType) {
  const html = buildMeuRelatorioHtml(data);
  const filename = `meu-relatorio-${data.clientName}.pdf`;
  await downloadAsPdf(html, filename); // sem multiPage → altura dinâmica
}
```

### Se o relatório precisa de múltiplas páginas A4 para impressão:

```ts
import { downloadAsPdf } from "@/lib/htmlToPdf";

export async function exportMeuRelatorioImprimivel(data: MeuDadoType) {
  const html = buildMeuRelatorioHtml(data);
  const filename = `meu-relatorio-${data.clientName}.pdf`;
  await downloadAsPdf(html, filename, { multiPage: true }); // A4 fixo com paginação
}
```

### Se o relatório faz parte de um ZIP (exportação em lote):

```ts
import { htmlToPdfBlob } from "@/lib/htmlToPdf";

const pdfBlob = await htmlToPdfBlob(html); // sem multiPage → altura dinâmica
zip.file(filename, pdfBlob);
```

---

## Histórico de decisões

| Data | Decisão | Motivo |
|---|---|---|
| 2026-05-18 | Adicionada flag `multiPage` em `htmlToPdfBlob` | Separar comportamento entre relatório interno (A4 fixo) e relatório personalizado (altura dinâmica), sem quebrar o que já funcionava |
| 2026-05-18 | `backgroundColor` trocado de `#09090b` para `#060814` | Alinhamento com identidade visual; previne fundo branco no Safari com backgrounds transparentes |
