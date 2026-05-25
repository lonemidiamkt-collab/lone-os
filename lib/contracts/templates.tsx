import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ContractData } from "./types";
import { SERVICE_LABELS } from "./types";

const s = StyleSheet.create({
  page: { padding: 50, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.6, color: "#1a1a1a" },
  header: { textAlign: "center", marginBottom: 30 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4, color: "#0d4af5" },
  subtitle: { fontSize: 9, color: "#666" },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 8, color: "#0d4af5", textTransform: "uppercase" },
  clauseTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  text: { fontSize: 9.5, textAlign: "justify", marginBottom: 6 },
  parties: { marginBottom: 12, padding: 12, backgroundColor: "#f8f9fa", borderRadius: 4 },
  partyLabel: { fontSize: 8, color: "#0d4af5", fontFamily: "Helvetica-Bold", marginBottom: 2, textTransform: "uppercase" },
  partyText: { fontSize: 9, marginBottom: 1 },
  signatures: { marginTop: 50, flexDirection: "row", justifyContent: "space-between" },
  signBlock: { width: "40%", textAlign: "center" },
  signLine: { borderBottom: "1px solid #333", marginBottom: 4, paddingTop: 40 },
  signName: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  signRole: { fontSize: 8, color: "#666" },
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, textAlign: "center", fontSize: 7, color: "#999" },
  value: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", padding: 10, marginVertical: 10, backgroundColor: "#f0f4ff", borderRadius: 4, color: "#0d4af5" },
  conditional: { marginTop: 8, padding: 8, backgroundColor: "#f8f8f0", borderRadius: 4, borderLeft: "3px solid #0d4af5" },
});

function fmt(v: number): string { return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`; }
function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${day} de ${months[parseInt(m) - 1]} de ${y}`;
}
function durLabel(n: number): string {
  return n === 3 ? "tres" : n === 6 ? "seis" : n === 12 ? "doze" : String(n);
}

export function ContractPDF({ data }: { data: ContractData }) {
  const label = SERVICE_LABELS[data.contrato.serviceType] || data.contrato.serviceType;
  const clauses = data.clauses || [];
  const conditionals = (data.conditionalClauses || []).filter((c) => c.enabled !== false);
  const pgDay = data.contrato.paymentDay || 10;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>CONTRATO DE PRESTACAO DE SERVICOS</Text>
          <Text style={s.subtitle}>{label}</Text>
        </View>

        {/* Parties */}
        <View style={s.parties}>
          <Text style={s.partyLabel}>Contratante</Text>
          <Text style={s.partyText}>{data.empresa.nomeFantasia || data.empresa.nome} {data.empresa.cnpj ? `— CNPJ: ${data.empresa.cnpj}` : ""}</Text>
          {data.empresa.endereco && <Text style={s.partyText}>Endereco: {data.empresa.endereco}</Text>}
          <Text style={s.partyText}>Responsavel: {data.empresa.responsavel} {data.empresa.cpf ? `— CPF: ${data.empresa.cpf}` : ""}</Text>
        </View>
        <View style={s.parties}>
          <Text style={s.partyLabel}>Contratada</Text>
          <Text style={s.partyText}>{data.contratada.nome} — CNPJ: {data.contratada.cnpj}</Text>
          <Text style={s.partyText}>Endereco: {data.contratada.endereco}</Text>
          <Text style={s.partyText}>Responsavel: {data.contratada.responsavel}</Text>
        </View>

        <Text style={s.sectionTitle}>Das Condicoes</Text>

        {/* Fixed clauses: Vigencia + Pagamento */}
        <Text style={s.clauseTitle}>Clausula 1 — Vigencia</Text>
        <Text style={s.text}>
          O presente contrato tera vigencia de {data.contrato.duracaoMeses} ({durLabel(data.contrato.duracaoMeses)}) meses,
          com inicio em {fmtDate(data.contrato.dataInicio)} e termino em {fmtDate(data.contrato.dataFim)},
          podendo ser renovado mediante acordo entre as partes.
        </Text>

        <Text style={s.clauseTitle}>Clausula 2 — Valor e Pagamento</Text>
        <Text style={s.text}>
          Pelo servico descrito, o CONTRATANTE pagara a CONTRATADA o valor mensal de{" "}
          {fmt(data.contrato.valorMensal)}, totalizando{" "}
          {fmt(data.contrato.valorMensal * data.contrato.duracaoMeses)} ao longo da vigencia.
          O pagamento devera ser realizado ate o dia {pgDay} de cada mes, via PIX ou transferencia bancaria.
        </Text>

        {/* Dynamic clauses from database */}
        {clauses.map((clause, i) => (
          <View key={clause.id}>
            <Text style={s.clauseTitle}>Clausula {i + 3} — {clause.title}</Text>
            <Text style={s.text}>{clause.body}</Text>
          </View>
        ))}

        {/* Conditional clauses */}
        {conditionals.length > 0 && (
          <Text style={s.sectionTitle}>Clausulas Adicionais</Text>
        )}
        {conditionals.map((clause, i) => (
          <View key={clause.id} style={s.conditional}>
            <Text style={s.clauseTitle}>Clausula {clauses.length + i + 3} — {clause.title}</Text>
            <Text style={s.text}>{clause.body}</Text>
          </View>
        ))}

        {/* General clauses */}
        <Text style={s.sectionTitle}>Disposicoes Gerais</Text>

        <Text style={s.clauseTitle}>Confidencialidade</Text>
        <Text style={s.text}>
          Ambas as partes se comprometem a manter sigilo sobre informacoes comerciais, estrategicas e de acesso
          compartilhadas durante a vigencia deste contrato, mesmo apos seu encerramento.
        </Text>

        <Text style={s.clauseTitle}>Rescisao</Text>
        <Text style={s.text}>
          O contrato podera ser rescindido por qualquer das partes mediante aviso previo de 30 dias.
          Em caso de rescisao antecipada sem justa causa, sera aplicada multa equivalente a 1 (uma) mensalidade.
        </Text>

        <Text style={s.clauseTitle}>Foro</Text>
        <Text style={s.text}>
          Fica eleito o foro da comarca do Rio de Janeiro/RJ para dirimir quaisquer controversias oriundas deste contrato.
        </Text>

        <Text style={s.value}>
          Valor Mensal: {fmt(data.contrato.valorMensal)} | Vigencia: {data.contrato.duracaoMeses} meses | Pgto dia {pgDay}
        </Text>

        {/* Signatures */}
        <View style={s.signatures}>
          <View style={s.signBlock}>
            <View style={s.signLine} />
            <Text style={s.signName}>{data.empresa.responsavel}</Text>
            <Text style={s.signRole}>CONTRATANTE</Text>
          </View>
          <View style={s.signBlock}>
            <View style={s.signLine} />
            <Text style={s.signName}>{data.contratada.responsavel}</Text>
            <Text style={s.signRole}>CONTRATADA — {data.contratada.nome}</Text>
          </View>
        </View>

        <Text style={s.footer}>
          Documento gerado pelo Lone OS em {new Date().toLocaleDateString("pt-BR")} | {data.contratada.nome}
        </Text>
      </Page>
    </Document>
  );
}
