export interface ContractClause {
  id: string;
  title: string;
  body: string;
  enabled?: boolean;
}

export interface ContractData {
  empresa: {
    nome: string;
    nomeFantasia: string;
    cnpj: string;
    endereco: string;
    responsavel: string;
    cpf: string;
    telefone: string;
  };
  contratada: {
    nome: string;
    cnpj: string;
    endereco: string;
    responsavel: string;
  };
  contrato: {
    serviceType: "assessoria_trafego" | "assessoria_social" | "lone_growth";
    valorMensal: number;
    dataInicio: string;
    dataFim: string;
    duracaoMeses: number;
    paymentDay?: number;
  };
  clauses?: ContractClause[];
  conditionalClauses?: ContractClause[];
}

export interface ContractRecord {
  id: string;
  clientId: string;
  version: number;
  serviceType: string;
  monthlyValue: number;
  startDate: string;
  endDate: string;
  durationMonths: number;
  status: "draft" | "active" | "expired";
  pdfUrl: string | null;
  generatedBy: string;
  generatedAt: string;
}

export const SERVICE_LABELS: Record<string, string> = {
  assessoria_trafego: "Assessoria de Trafego Pago",
  assessoria_social: "Assessoria de Social Media",
  lone_growth: "Lone Growth (Trafego + Social + Design)",
};

export const LONE_MIDIA = {
  nome: "Lone Midia Marketing Digital LTDA",
  cnpj: "00.000.000/0001-00",
  endereco: "Rio de Janeiro, RJ",
  responsavel: "Roberto Lino",
};
