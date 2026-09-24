// E-mail vindo de cadastro antigo/onboarding às vezes chega com espaço ou ponto final colado
// ("fulano@gmail.com."). A validação do /api/clients/update recusava a ficha INTEIRA por isso — a
// Edumar não salvava nada (24/09). Aqui só limpa o que é claramente sujeira; o resto a validação julga.
export function normalizarEmail(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const limpo = v.trim().replace(/[.,;]+$/, "").trim();
  return limpo === "" ? null : limpo;
}

/** Rótulos em português dos campos da ficha, pra mensagem de erro dizer O QUE está errado. */
export const ROTULO_CAMPO_CLIENTE: Record<string, string> = {
  email: "e-mail", emailCorporativo: "e-mail corporativo", name: "nome", nomeFantasia: "nome fantasia",
  phone: "telefone", companyPhone: "telefone da empresa", contactPhone: "telefone do contato",
  cpfCnpj: "CPF/CNPJ", cnpj: "CNPJ", monthlyBudget: "verba mensal", serviceType: "serviço contratado",
  status: "status", industry: "segmento", paymentMethod: "forma de pagamento", joinDate: "data de entrada",
  contractEnd: "fim do contrato", birthDate: "data de nascimento", instagramUser: "Instagram",
  driveLink: "link do Drive", notes: "observações", fixedBriefing: "briefing fixo",
  campaignBriefing: "briefing de campanha", assignedDesigner: "designer", assignedSocial: "social media",
  assignedTraffic: "gestor de tráfego", perfilConteudo: "perfil de conteúdo",
};

export function mensagemDadosInvalidos(caminhos: readonly unknown[]): string {
  const campos = [...new Set(caminhos.map((c) => ROTULO_CAMPO_CLIENTE[String(c)] ?? String(c ?? "campo")))];
  return campos.length ? `Dados inválidos: ${campos.join(", ")}` : "Dados inválidos";
}
