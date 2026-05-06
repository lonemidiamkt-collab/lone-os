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
  nome: "LM Assessoria e Marketing LTDA",
  cnpj: "62.074.361/0001-30",
  endereco: "AV. Getúlio Vargas, 221, sala 403, Centro, Araruama/RJ, CEP 28.979-129",
  responsavel: "Lucas Bueno Dos Santos e Roberto Lino Machado Neto",
};
