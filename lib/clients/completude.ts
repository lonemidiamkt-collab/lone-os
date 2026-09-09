// O QUE FALTA NO CADASTRO DE UM CLIENTE.
//
// Roberto (09/09): 39 dos 50 clientes ativos nunca passaram pelo formulário — entraram antes dele
// existir ou pelo handoff do CRM. Não é dado perdido, é dado nunca pedido. Mandar a esses
// clientes o formulário inteiro, de 20 campos, para quem já é cliente há um ano, tem uma taxa de
// resposta previsível: baixa.
//
// Então a régua é outra: descobrir o que falta, PRÉ-PREENCHER o resto, e perguntar só o buraco.
//
// Função pura — recebe a linha do cliente, devolve o que falta. Testável sem banco, e a mesma
// regra serve para a lista da equipe e para a barra de progresso do formulário.

/** Só o que a regra olha. Nomes iguais aos das colunas, para não haver tradução no meio. */
export interface LinhaCliente {
  nome_fantasia?: string | null;
  razao_social?: string | null;
  cnpj?: string | null;
  nicho?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  company_phone?: string | null;
  contact_phone?: string | null;
  email?: string | null;
  instagram_user?: string | null;
  endereco_rua?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  endereco_cep?: string | null;
  doc_logo?: string | null;
  doc_contrato_social?: string | null;
  /** Não entram na conta do que FALTA, mas vão junto no link de completar. */
  cpf_cnpj?: string | null;
  doc_identidade?: string | null;
}

export interface CampoFaltante {
  campo: keyof LinhaCliente;
  rotulo: string;
  /** Sem ele o contrato não sai nem a operação anda. */
  essencial: boolean;
}

/**
 * A lista, em ordem de importância operacional.
 *
 * `essencial` é o que trava alguma coisa de verdade: contrato, cobrança, contato. O resto é
 * desejável — e marcar tudo como essencial faria a lista perder o sentido, que é justamente
 * separar "precisa hoje" de "seria bom ter".
 */
const CAMPOS: CampoFaltante[] = [
  { campo: "nome_fantasia",       rotulo: "Nome fantasia",          essencial: true },
  { campo: "cnpj",                rotulo: "CNPJ",                   essencial: true },
  { campo: "razao_social",        rotulo: "Razão social",           essencial: true },
  { campo: "contact_name",        rotulo: "Nome do responsável",    essencial: true },
  { campo: "phone",               rotulo: "WhatsApp",               essencial: true },
  { campo: "email",               rotulo: "E-mail",                 essencial: true },
  { campo: "endereco_rua",        rotulo: "Endereço",               essencial: true },
  { campo: "endereco_cidade",     rotulo: "Cidade",                 essencial: true },
  { campo: "endereco_cep",        rotulo: "CEP",                    essencial: true },
  { campo: "doc_contrato_social", rotulo: "Contrato social",        essencial: true },
  { campo: "doc_logo",            rotulo: "Logotipo",               essencial: false },
  { campo: "instagram_user",      rotulo: "Instagram",              essencial: false },
  { campo: "company_phone",       rotulo: "Telefone da empresa",    essencial: false },
  { campo: "nicho",               rotulo: "Ramo de atividade",      essencial: false },
  { campo: "endereco_bairro",     rotulo: "Bairro",                 essencial: false },
  { campo: "endereco_estado",     rotulo: "Estado",                 essencial: false },
];

/** Vazio de verdade: `null`, `undefined` e string só de espaço contam como não preenchido. */
const vazio = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === "";

export interface Completude {
  faltando: CampoFaltante[];
  faltandoEssencial: CampoFaltante[];
  preenchidos: number;
  total: number;
  /** 0 a 100. É o que a lista ordena — quem está pior aparece primeiro. */
  percentual: number;
  completo: boolean;
}

export function completude(c: LinhaCliente): Completude {
  const faltando = CAMPOS.filter((f) => vazio(c[f.campo]));
  const preenchidos = CAMPOS.length - faltando.length;
  return {
    faltando,
    faltandoEssencial: faltando.filter((f) => f.essencial),
    preenchidos,
    total: CAMPOS.length,
    percentual: Math.round((preenchidos / CAMPOS.length) * 100),
    // "Completo" é não faltar nada ESSENCIAL. Cobrar o cliente por causa do bairro seria gastar a
    // única chance de resposta com o que não trava nada.
    completo: faltando.every((f) => !f.essencial),
  };
}

/**
 * Os campos que o formulário de completar deve JÁ TRAZER preenchidos.
 *
 * Chave = nome da coluna em `client_onboarding_submissions`. O formulário carrega da submissão,
 * então pré-preencher ali é o que faz o cliente abrir o link e ver os próprios dados em vez de
 * uma tela em branco.
 */
export function preencherDoCliente(entrada: LinhaCliente): Record<string, unknown> {
  // A linha crua traz colunas além das que a regra conhece (cpf_cnpj, doc_identidade). O índice
  // fica aqui dentro para quem chama poder passar o registro do banco como ele veio.
  const c = entrada as LinhaCliente & Record<string, unknown>;
  const de = (col: string, valor: unknown) => (vazio(valor) ? {} : { [col]: valor });
  return {
    ...de("nome_fantasia", c.nome_fantasia),
    ...de("razao_social", c.razao_social),
    ...de("cnpj", c.cnpj),
    ...de("nicho", c.nicho),
    ...de("contact_name", c.contact_name),
    ...de("contact_cpf", c.cpf_cnpj),
    ...de("contact_whatsapp", c.phone),
    ...de("contact_email", c.email),
    ...de("company_phone", c.company_phone),
    ...de("contact_phone", c.contact_phone),
    ...de("instagram_user", c.instagram_user),
    ...de("endereco_rua", c.endereco_rua),
    ...de("endereco_bairro", c.endereco_bairro),
    ...de("endereco_cidade", c.endereco_cidade),
    ...de("endereco_estado", c.endereco_estado),
    ...de("endereco_cep", c.endereco_cep),
    // Os documentos vão junto: exigir que um cliente de um ano reenvie o contrato social só
    // porque o formulário é novo seria motivo suficiente para ele desistir no meio.
    ...de("doc_logo", c.doc_logo),
    ...de("doc_contrato_social", c.doc_contrato_social),
    ...de("doc_identidade", c.doc_identidade),
  };
}
