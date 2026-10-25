"use client";

// components/equipe/GestaoEquipe.tsx — Área CEO › Gestão da Equipe.
//
// Saiu de app/ceo/page.tsx em 25/10/2026 (onda 6 da auditoria de erro recuperável, itens 8.1, 8.2, 8.6,
// 8.7, 8.8 e 8.9). O que mudou:
//  · a lista vem do GET /api/team (ativos, desativados E removidos) — antes vinha do roster do login,
//    que só traz ativos: quem era desativado sumia no F5 e não havia "Reativar";
//  · desativar e remover pedem confirmação COM O NOME e oferecem "Desfazer"; removidos ficam numa seção
//    própria com "Restaurar" (o login é bloqueado, não apagado);
//  · o e-mail é só leitura (é o login; o PATCH nunca o aceitou e a tela mostrava a troca como salva);
//  · a lista só muda com a resposta do servidor; senha curta é recusada ANTES de gravar qualquer coisa;
//  · quem é admin fixo aparece marcado (mudar a função dele não tira o acesso de admin no servidor);
//  · admin pode zerar a verificação em duas etapas de quem perdeu o celular (fica registrado).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle, Edit3, Eye, EyeOff, Instagram, KeyRound, Loader2, Mail, Palette, RotateCcw, Save,
  ShieldCheck, ShieldOff, Smartphone, Trash2, TrendingUp, UserPlus, Users, X,
} from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { ehAdminFixo } from "@/lib/auth/admins-fixos";
import MedievalAvatar, { AVATAR_OPTIONS, getUserAvatar, setUserAvatar, type AvatarType } from "@/components/MedievalAvatars";
import {
  SENHA_MINIMA, confirmacaoDesativar, confirmacaoRemover, separarEquipe, validarSenhaNova, type Situacao,
} from "@/lib/equipe/gestao";
import type { Role } from "@/lib/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "CEO / Admin" },
  { value: "manager", label: "Gerente de Operações" },
  { value: "traffic", label: "Gestor de Tráfego" },
  { value: "social", label: "Social Media" },
  { value: "designer", label: "Designer" },
  { value: "comercial", label: "Comercial (SDR)" },
];

const ROLE_ICON: Record<string, typeof Users> = {
  manager: Users,
  traffic: TrendingUp,
  social: Instagram,
  designer: Palette,
};

/** Como o GET /api/team devolve cada pessoa. */
interface Membro {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
  is_active: boolean | null;
  deleted_at: string | null;
  created_at?: string;
  whatsappFinal: string | null;
  situacao: Situacao;
  /** null = não consegui consultar os logins agora. */
  temLogin: boolean | null;
  loginBloqueado: boolean | null;
  duasEtapas: boolean | null;
  adminFixo: boolean;
}

/** id legível do avatar (o mesmo que o Header usa): parte antes do @, só letras e números. */
const slugDoEmail = (email: string) => email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

const campo = "w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

type Confirmacao = { tipo: "desativar" | "remover" | "duas-etapas"; id: string } | null;

export default function GestaoEquipe() {
  const { currentProfile, role } = useRole();
  const souAdmin = role === "admin" || ehAdminFixo(currentProfile.email);
  const euEmail = currentProfile.email.toLowerCase();

  const [equipe, setEquipe] = useState<Membro[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [avisoLogins, setAvisoLogins] = useState<string | null>(null);
  const [erroEquipe, setErroEquipe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // id (ou "novo") com ação em andamento
  const [confirmar, setConfirmar] = useState<Confirmacao>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<{ team: Membro[]; avisoLogins?: string }>("/api/team");
    if (!r.ok || !r.data) { setErroCarga(r.erro ?? "Não consegui carregar a equipe."); return; }
    setErroCarga(null);
    setEquipe(r.data.team);
    setAvisoLogins(r.data.avisoLogins ?? null);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  /** Troca a pessoa na lista pela versão que o SERVIDOR devolveu (nunca pelo que a tela supôs — 8.6). */
  const aplicar = useCallback((m: Membro) => {
    setEquipe((lista) => (lista ? (lista.some((x) => x.id === m.id) ? lista.map((x) => (x.id === m.id ? m : x)) : [...lista, m]) : [m]));
  }, []);

  const grupos = useMemo(() => separarEquipe(equipe ?? []), [equipe]);

  // ── Novo funcionário ────────────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("social");
  // Vazio, com o mínimo dito no campo: o "1234" pré-preenchido era sempre recusado (mínimo 6).
  const [newPassword, setNewPassword] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [jaExiste, setJaExiste] = useState<{ id: string; nome: string; situacao: Situacao } | null>(null);

  const senhaNovaCurta = newPassword.trim().length > 0 && newPassword.trim().length < SENHA_MINIMA;
  const podeCadastrar = !!newName.trim() && !!newEmail.trim() && newPassword.trim().length >= SENHA_MINIMA && ocupado !== "novo";

  const handleAddMember = useCallback(async () => {
    if (!podeCadastrar) return;
    setOcupado("novo"); setErroEquipe(null); setJaExiste(null);
    const r = await chamar<{ member: Membro }>("/api/team", {
      name: newName.trim(), email: newEmail.trim().toLowerCase(),
      role: newRole, password: newPassword.trim(),
      whatsapp_phone: newWhatsapp.trim() || null,
    });
    setOcupado(null);
    if (!r.ok || !r.data?.member) {
      setErroEquipe(r.erro ?? "Não consegui cadastrar.");
      // E-mail que já existiu: em vez de beco sem saída, o caminho de volta (8.2).
      if (r.status === 409) {
        const lista = equipe ?? [];
        const achado = lista.find((m) => m.email.toLowerCase() === newEmail.trim().toLowerCase());
        if (achado && achado.situacao !== "ativo") setJaExiste({ id: achado.id, nome: achado.name, situacao: achado.situacao });
      }
      return;
    }
    aplicar(r.data.member);
    toast.success(`${r.data.member.name} cadastrado, com login.`);
    setNewName(""); setNewEmail(""); setNewRole("social"); setNewPassword(""); setNewWhatsapp("");
    setShowAddForm(false);
  }, [podeCadastrar, newName, newEmail, newRole, newPassword, newWhatsapp, equipe, aplicar]);

  // ── Editar ──────────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editRole, setEditRole] = useState<Role>("social");
  const [editAvatar, setEditAvatar] = useState<AvatarType>("shield");
  const [editPassword, setEditPassword] = useState("");
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const validacaoSenha = validarSenhaNova(editPassword);

  const handleStartEdit = useCallback((m: Membro) => {
    setEditingId(m.id);
    setEditName(m.name);
    setEditRole(m.role);
    setEditAvatar(getUserAvatar(slugDoEmail(m.email)));
    setEditPassword(""); // começa VAZIO — "deixe vazio para manter". Pré-preencher confundia e quebrava a troca.
    setEditWhatsapp("");
    setErroEdicao(null);
    setShowAddForm(false);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const m = equipe?.find((x) => x.id === editingId);
    if (!m || !editName.trim()) return;
    // 8.7: a senha é conferida ANTES de gravar qualquer coisa. Antes nome/função/WhatsApp já tinham
    // sido salvos quando aparecia "a senha precisa ter 6… Nada foi alterado".
    const senha = validarSenhaNova(editPassword);
    if (!senha.ok) { setErroEdicao(senha.erro); return; }
    setOcupado(m.id); setErroEdicao(null);
    setUserAvatar(slugDoEmail(m.email), editAvatar); // avatar mora no navegador

    const mudouAlgo = editName.trim() !== m.name || editRole !== m.role || !!editWhatsapp.trim();
    if (mudouAlgo) {
      const r = await chamar<{ member: Membro; aviso?: string }>("/api/team", {
        id: m.id, name: editName.trim(), role: editRole,
        ...(editWhatsapp.trim() ? { whatsapp_phone: editWhatsapp.trim() } : {}),
      }, { method: "PATCH" });
      if (!r.ok || !r.data?.member) {
        setOcupado(null);
        setErroEdicao(`Nada foi salvo: ${r.erro ?? "falha no servidor"}`);
        return;
      }
      aplicar(r.data.member);
      if (r.data.aviso) toast.warning(r.data.aviso, { duration: 12000 });
    }
    // Senha nova → atualiza DE VERDADE no Supabase Auth.
    if (senha.trocar) {
      const r = await chamar("/api/auth/set-password", { email: m.email, password: editPassword.trim() });
      setOcupado(null);
      if (!r.ok) {
        setErroEdicao(`${mudouAlgo ? "Nome, função e WhatsApp foram salvos. " : ""}A senha NÃO foi trocada: ${r.erro}`);
        return;
      }
      toast.success(`Senha de ${m.name} atualizada no login.`);
    } else {
      setOcupado(null);
      if (mudouAlgo) toast.success(`${editName.trim()} atualizado.`);
    }
    setEditingId(null);
  }, [equipe, editingId, editName, editRole, editWhatsapp, editPassword, editAvatar, aplicar]);

  // ── Desativar / reativar (8.1) ──────────────────────────────────────────────
  const mudarAtivo = useCallback(async (m: Membro, ativo: boolean, desfazendo = false): Promise<boolean> => {
    setOcupado(m.id); setErroEquipe(null);
    const r = await chamar<{ member: Membro }>("/api/team", { id: m.id, is_active: ativo }, { method: "PATCH" });
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok || !r.data?.member) {
      const msg = `${ativo ? "Não reativei" : "Não desativei"} ${m.name}: ${r.erro ?? "falha no servidor"}`;
      if (desfazendo) toast.error(msg); else setErroEquipe(msg);
      return false;
    }
    aplicar(r.data.member);
    if (!ativo) {
      toast.success(`${m.name} desativado. O acesso cai em até 1 minuto.`, {
        duration: 15000,
        action: { label: "Desfazer", onClick: () => { void mudarAtivo(m, true, true).then((ok) => ok && toast.success(`${m.name} reativado.`)); } },
      });
    } else if (!desfazendo) {
      toast.success(`${m.name} reativado — já pode entrar de novo.`);
    }
    return true;
  }, [aplicar]);

  // ── Remover / restaurar (8.2) ───────────────────────────────────────────────
  const [senhaRestaurar, setSenhaRestaurar] = useState<{ id: string; senha: string; erro?: string } | null>(null);

  const restaurar = useCallback(async (m: Membro, extra?: { whatsapp?: string | null; password?: string }): Promise<boolean> => {
    setOcupado(m.id); setErroEquipe(null);
    const r = await chamar<{ member: Membro; aviso?: string; precisaSenha?: boolean }>("/api/team", {
      acao: "restaurar", id: m.id,
      ...(extra?.whatsapp ? { whatsapp_phone: extra.whatsapp } : {}),
      ...(extra?.password ? { password: extra.password } : {}),
    });
    setOcupado(null);
    if (!r.ok || !r.data?.member) {
      // Login apagado no modelo antigo: precisa de senha para recriar. Abre o campo em vez de só falhar.
      if (r.status === 409 && /senha nova/i.test(r.erro ?? "")) {
        setSenhaRestaurar({ id: m.id, senha: "", erro: r.erro ?? undefined });
        return false;
      }
      toast.error(`Não restaurei ${m.name}: ${r.erro ?? "falha no servidor"}`);
      return false;
    }
    aplicar(r.data.member);
    setSenhaRestaurar(null);
    toast.success(`${m.name} restaurado — já pode entrar de novo.${r.data.aviso ? ` (${r.data.aviso})` : ""}`);
    return true;
  }, [aplicar]);

  const remover = useCallback(async (m: Membro) => {
    setOcupado(m.id); setErroEquipe(null);
    const r = await chamar<{ nome: string; whatsapp: string | null; loginBloqueado: boolean }>("/api/team", { id: m.id }, { method: "DELETE" });
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok) { setErroEquipe(`Não removi ${m.name}: ${r.erro ?? "falha no servidor"}`); return; }
    const whatsapp = r.data?.whatsapp ?? null;
    aplicar({ ...m, is_active: false, deleted_at: new Date().toISOString(), situacao: "removido", whatsappFinal: null, loginBloqueado: r.data?.loginBloqueado ?? m.loginBloqueado });
    toast.success(`${m.name} removido: login bloqueado e WhatsApp desligado do agente.`, {
      duration: 15000,
      // O Desfazer põe o WhatsApp de volta (a rota devolveu o número que estava cadastrado).
      action: { label: "Desfazer", onClick: () => { void restaurar(m, { whatsapp }); } },
    });
  }, [aplicar, restaurar]);

  // ── Duas etapas (8.9) ───────────────────────────────────────────────────────
  const zerarDuasEtapas = useCallback(async (m: Membro) => {
    setOcupado(m.id); setErroEquipe(null);
    const r = await chamar<{ removidos: number; aviso?: string }>("/api/team/duas-etapas", { id: m.id });
    setOcupado(null);
    setConfirmar(null);
    if (!r.ok) { setErroEquipe(`Não zerei a verificação de ${m.name}: ${r.erro ?? "falha no servidor"}`); return; }
    aplicar({ ...m, duasEtapas: false });
    toast.success(r.data?.aviso ?? `Verificação em duas etapas de ${m.name} zerada. Ela entra só com a senha e configura de novo em Configurações › Segurança.`, { duration: 12000 });
  }, [aplicar]);

  // ── Tela ────────────────────────────────────────────────────────────────────
  const membroEditando = equipe?.find((m) => m.id === editingId) ?? null;

  // Função que DEVOLVE a linha (não um componente): componente declarado aqui dentro nasceria de novo a
  // cada render, e o campo de senha do Restaurar perderia o foco a cada tecla.
  const linha = (m: Membro) => {
    const roleLabel = ROLE_OPTIONS.find((r) => r.value === m.role)?.label ?? m.role;
    const RoleIcon = ROLE_ICON[m.role] ?? Users;
    const souEu = m.email.toLowerCase() === euEmail;
    const esta = ocupado === m.id;
    const conf = confirmar?.id === m.id ? confirmar.tipo : null;
    const ativo = m.situacao === "ativo";

    return (
      <div key={m.id} className={`card space-y-3 transition-opacity ${ativo ? "" : "opacity-80"}`}>
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${ativo ? "bg-primary/15 border-primary/20" : "bg-muted border-border"}`}>
            <span className={`text-sm font-bold ${ativo ? "text-primary" : "text-muted-foreground"}`}>{m.initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground text-sm">{m.name}{souEu ? " (você)" : ""}</p>
              {m.situacao === "desativado" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-lone-warning-bg text-lone-warning border border-lone-warning-border font-bold uppercase">Desativado</span>}
              {m.situacao === "removido" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-lone-danger-bg text-lone-danger border border-lone-danger-border font-bold uppercase">Removido</span>}
              {m.adminFixo && (
                <span title="Administrador no servidor pela lista fixa dos sócios: mudar a função aqui não tira esse acesso."
                  className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border font-bold uppercase">Admin fixo</span>
              )}
              {m.temLogin === false && ativo && <span className="text-[9px] px-1.5 py-0.5 rounded bg-lone-danger-bg text-lone-danger border border-lone-danger-border font-bold uppercase" title="Está na lista, mas não consegue entrar: não existe login com este e-mail.">Sem login</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span className="flex items-center gap-1"><Mail size={10} /> {m.email}</span>
              {ativo && (m.whatsappFinal
                ? <span className="flex items-center gap-1"><Smartphone size={10} /> …{m.whatsappFinal}</span>
                : <span className="flex items-center gap-1 text-lone-warning" title="Sem WhatsApp cadastrado: o agente não reconhece esta pessoa — nenhum comando dela executa."><Smartphone size={10} /> sem WhatsApp — mudo para o agente</span>)}
              <span className="flex items-center gap-1"><RoleIcon size={10} /> {roleLabel}</span>
              {m.duasEtapas && <span className="flex items-center gap-1 text-lone-success"><ShieldCheck size={10} /> duas etapas</span>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {esta && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            {ativo && (
              <>
                <button onClick={() => handleStartEdit(m)} disabled={esta} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title="Editar">
                  <Edit3 size={14} />
                </button>
                {souAdmin && m.duasEtapas && !souEu && (
                  <button onClick={() => setConfirmar({ tipo: "duas-etapas", id: m.id })} disabled={esta} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title="Zerar verificação em duas etapas (perdeu o celular)">
                    <ShieldOff size={14} />
                  </button>
                )}
                {!souEu && (
                  <button onClick={() => setConfirmar({ tipo: "desativar", id: m.id })} disabled={esta} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors" title="Desativar acesso">
                    <EyeOff size={14} />
                  </button>
                )}
                {souAdmin && !souEu && (
                  <button onClick={() => setConfirmar({ tipo: "remover", id: m.id })} disabled={esta} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-lone-danger-bg transition-colors" title="Remover">
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
            {m.situacao === "desativado" && (
              <button onClick={() => void mudarAtivo(m, true)} disabled={esta} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-muted transition-colors">
                <Eye size={13} /> Reativar
              </button>
            )}
            {m.situacao === "removido" && souAdmin && (
              <button onClick={() => void restaurar(m)} disabled={esta} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-muted transition-colors">
                <RotateCcw size={13} /> Restaurar
              </button>
            )}
          </div>
        </div>

        {conf && (
          <div role="alertdialog" aria-label={conf === "desativar" ? `Desativar ${m.name}` : conf === "remover" ? `Remover ${m.name}` : `Zerar duas etapas de ${m.name}`}
            className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 space-y-2 animate-fade-in">
            <p className="text-xs text-foreground leading-relaxed">
              {conf === "desativar" ? confirmacaoDesativar(m.name)
                : conf === "remover" ? confirmacaoRemover(m.name, m.email)
                : `Zerar a verificação em duas etapas de ${m.name}? Use quando a pessoa perdeu ou trocou o celular. Ela passa a entrar só com a senha e configura de novo em Configurações › Segurança. Fica registrado que foi você.`}
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={esta}
                onClick={() => { if (conf === "desativar") void mudarAtivo(m, false); else if (conf === "remover") void remover(m); else void zerarDuasEtapas(m); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${conf === "remover" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
                {conf === "desativar" ? `Desativar ${m.name.split(" ")[0]}` : conf === "remover" ? `Remover ${m.name.split(" ")[0]}` : "Zerar verificação"}
              </button>
              <button type="button" onClick={() => setConfirmar(null)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
          </div>
        )}

        {senhaRestaurar?.id === m.id && (
          <div className="rounded-lg border border-border bg-muted p-3 space-y-2 animate-fade-in">
            <p className="text-xs text-foreground">{senhaRestaurar.erro}</p>
            <div className="flex gap-2 flex-wrap">
              <input type="password" value={senhaRestaurar.senha} placeholder={`senha nova (mínimo ${SENHA_MINIMA})`}
                onChange={(e) => setSenhaRestaurar({ ...senhaRestaurar, senha: e.target.value })}
                className="flex-1 min-w-[180px] bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" />
              <button type="button" disabled={senhaRestaurar.senha.trim().length < SENHA_MINIMA || esta}
                onClick={() => void restaurar(m, { password: senhaRestaurar.senha.trim() })}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">
                Recriar login e restaurar
              </button>
              <button type="button" onClick={() => setSenhaRestaurar(null)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-foreground">Gestão de Funcionários</h3>
          <p className="text-muted-foreground text-sm mt-0.5">Cadastre, edite, desative ou remova membros da equipe. Tudo aqui tem volta.</p>
        </div>
        <button onClick={() => { setShowAddForm(true); setEditingId(null); setErroEquipe(null); setJaExiste(null); }} className="btn-primary flex items-center gap-2 text-sm">
          <UserPlus size={15} />
          Novo Funcionário
        </button>
      </div>

      {erroCarga && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">
          <span>Não consegui carregar a equipe: {erroCarga}</span>
          <button type="button" onClick={() => void carregar()} className="shrink-0 rounded-lg bg-card px-3 py-1 font-medium text-foreground hover:bg-accent">Tentar de novo</button>
        </div>
      )}
      {avisoLogins && <p className="text-xs text-lone-warning">{avisoLogins}</p>}
      {erroEquipe && !showAddForm && (
        <div className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erroEquipe}</div>
      )}

      {/* Summary cards (só quem está ativo) */}
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {ROLE_OPTIONS.map((r) => (
          <div key={r.value} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{equipe ? grupos.ativo.filter((m) => m.role === r.value).length : "—"}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{r.label}</p>
          </div>
        ))}
      </div>

      {/* Add new member form */}
      {showAddForm && (
        <div className="card border-primary/30 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <UserPlus size={16} className="text-primary" />
              Cadastrar Novo Funcionário
            </h4>
            <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
          {/* O erro do servidor precisa APARECER. O bug que trouxe isto aqui foi um
              cadastro que pareceu dar certo e não existia em lugar nenhum. */}
          {erroEquipe && (
            <div className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger space-y-2">
              <p>{erroEquipe}</p>
              {jaExiste && (
                <button type="button" className="rounded-lg bg-card px-3 py-1 font-medium text-foreground hover:bg-accent"
                  onClick={() => {
                    const m = equipe?.find((x) => x.id === jaExiste.id);
                    if (!m) return;
                    setShowAddForm(false); setErroEquipe(null); setJaExiste(null);
                    void (jaExiste.situacao === "desativado" ? mudarAtivo(m, true) : restaurar(m));
                  }}>
                  {jaExiste.situacao === "desativado" ? `Reativar ${jaExiste.nome}` : `Restaurar ${jaExiste.nome}`}
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="novo-membro-nome" className="text-xs text-muted-foreground font-medium block mb-1.5">Nome completo *</label>
              <input id="novo-membro-nome" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: João Silva" className={campo} />
            </div>
            <div>
              <label htmlFor="novo-membro-email" className="text-xs text-muted-foreground font-medium block mb-1.5">E-mail (é o login) *</label>
              <input id="novo-membro-email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setJaExiste(null); }} placeholder="joao@lonemidia.com" type="email" className={campo} />
            </div>
            <div>
              <label htmlFor="novo-membro-whatsapp" className="text-xs text-muted-foreground font-medium block mb-1.5">WhatsApp</label>
              <input id="novo-membro-whatsapp" value={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.value)} placeholder="(22) 99999-9999" inputMode="tel" className={campo} />
              <p className="text-[10px] text-muted-foreground mt-1">É por ele que o agente reconhece a pessoa. Sem WhatsApp, os comandos dela não executam.</p>
            </div>
            <div>
              <label htmlFor="novo-membro-funcao" className="text-xs text-muted-foreground font-medium block mb-1.5">Função *</label>
              <select id="novo-membro-funcao" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className={campo}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="novo-membro-senha" className="text-xs text-muted-foreground font-medium block mb-1.5">Senha inicial * (mínimo {SENHA_MINIMA} caracteres)</label>
              <input id="novo-membro-senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={`mínimo ${SENHA_MINIMA} caracteres`} className={campo} />
              {senhaNovaCurta && <p className="text-[11px] text-lone-warning mt-1">Faltam {SENHA_MINIMA - newPassword.trim().length} caractere(s).</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)} className="btn-ghost text-sm px-4 py-2">Cancelar</button>
            <button onClick={handleAddMember} disabled={!podeCadastrar} className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-30">
              {ocupado === "novo" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {ocupado === "novo" ? "Cadastrando…" : "Cadastrar"}
            </button>
          </div>
        </div>
      )}

      {/* Edição */}
      {membroEditando && (
        <div className="card border-primary/30 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Edit3 size={14} className="text-primary" />
              Editando: {membroEditando.name}
            </h4>
            <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X size={16} /></button>
          </div>
          {erroEdicao && <div role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erroEdicao}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="editar-nome" className="text-xs text-muted-foreground font-medium block mb-1.5">Nome</label>
              <input id="editar-nome" value={editName} onChange={(e) => setEditName(e.target.value)} className={campo} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1.5">E-mail (login)</p>
              {/* Só leitura (8.6): é o login. O PATCH nunca aceitou trocar, e a tela mostrava o novo como salvo. */}
              <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground">{membroEditando.email}</p>
              <p className="text-[10px] text-muted-foreground mt-1">O e-mail é o login e não muda aqui. Para trocar, remova e cadastre de novo.</p>
            </div>
            <div>
              <label htmlFor={`editar-whatsapp-${membroEditando.id}`} className="text-xs text-muted-foreground font-medium block mb-1.5">
                WhatsApp {membroEditando.whatsappFinal ? <span className="text-muted-foreground">(cadastrado: …{membroEditando.whatsappFinal})</span> : <span className="text-lone-warning">(sem número — mudo para o agente)</span>}
              </label>
              <input id={`editar-whatsapp-${membroEditando.id}`} value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value)}
                placeholder={membroEditando.whatsappFinal ? "deixe vazio para manter" : "(22) 99999-9999"} inputMode="tel" className={campo} />
            </div>
            <div>
              <label htmlFor="editar-funcao" className="text-xs text-muted-foreground font-medium block mb-1.5">Função</label>
              <select id="editar-funcao" value={editRole} onChange={(e) => setEditRole(e.target.value as Role)} className={campo}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {membroEditando.adminFixo && editRole !== "admin" && (
                <p className="text-[11px] text-lone-warning mt-1 flex items-start gap-1">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  {membroEditando.name} é admin fixo: a função muda o menu e as carteiras, mas no servidor ele continua administrador.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-muted-foreground font-medium mb-2">Avatar Medieval</p>
              <div className="flex items-center gap-3 flex-wrap">
                {AVATAR_OPTIONS.map((opt) => (
                  <button key={opt.type} type="button" onClick={() => setEditAvatar(opt.type)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${editAvatar === opt.type ? "border-primary/50 bg-primary/[0.06]" : "border-transparent hover:bg-muted"}`}>
                    <MedievalAvatar type={opt.type} size={36} />
                    <span className="text-[9px] text-muted-foreground">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="editar-senha" className="text-xs text-muted-foreground font-medium block mb-1.5">Nova senha (deixe vazio para manter)</label>
              <input id="editar-senha" type="password" value={editPassword} onChange={(e) => { setEditPassword(e.target.value); setErroEdicao(null); }}
                placeholder={`mínimo ${SENHA_MINIMA} caracteres`} className={campo} />
              {/* 8.7: o problema aparece no campo, antes de clicar em salvar. */}
              {!validacaoSenha.ok && <p className="text-[11px] text-lone-warning mt-1">{validacaoSenha.erro.replace(" Nada foi salvo.", "")}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="btn-ghost text-sm px-4 py-2">Cancelar</button>
            <button onClick={handleSaveEdit} disabled={!editName.trim() || !validacaoSenha.ok || ocupado === membroEditando.id}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-30">
              {ocupado === membroEditando.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {!equipe && !erroCarga && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando a equipe…</p>}
      {equipe && (
        <div className="space-y-2">
          {grupos.ativo.map((m) => linha(m))}
        </div>
      )}

      {grupos.desativado.length > 0 && (
        <section className="space-y-2" aria-label="Desativados">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desativados ({grupos.desativado.length}) — sem acesso, cadastro mantido</h4>
          {grupos.desativado.map((m) => linha(m))}
        </section>
      )}

      {grupos.removido.length > 0 && (
        <section className="space-y-2" aria-label="Removidos">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Removidos ({grupos.removido.length}) — login bloqueado</h4>
          {grupos.removido.map((m) => linha(m))}
        </section>
      )}

      <div className="flex items-start gap-3 bg-lone-warning-bg border border-lone-warning-border rounded-xl px-4 py-3">
        <KeyRound size={16} className="text-lone-warning mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Adicionar cria o login junto.</strong> O sistema grava na equipe <em>e</em> cria o acesso com a senha informada — as duas coisas, ou nenhuma.</p>
          <p><strong className="text-foreground">Desativar</strong> é para afastamento: bloqueia o acesso em até 1 minuto e mantém o cadastro; volta em &quot;Reativar&quot;. <strong className="text-foreground">Remover</strong> bloqueia o login e desliga o WhatsApp do agente; o histórico fica e volta em &quot;Restaurar&quot;. Ninguém desativa ou remove a si mesmo nem o último administrador.</p>
          <p className="flex items-center gap-1"><CheckCircle size={11} className="text-lone-success" /> Quem perdeu o celular da verificação em duas etapas: um administrador zera aqui (ícone do escudo), e fica registrado.</p>
        </div>
      </div>
    </div>
  );
}
