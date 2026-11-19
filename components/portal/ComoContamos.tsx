"use client";

// components/portal/ComoContamos.tsx — "Como contamos os números" (19/11/2026, Lone Results 3.0).
//
// Antes era uma linha no rodapé, só na área de Anúncios: quem estava no Google ou no Instagram não tinha
// onde ler o que cada número quer dizer. Agora é uma folha que abre de qualquer área (botão no cabeçalho e
// no rodapé), com uma seção por canal que o cliente TEM — de baixo no celular, painel à direita no
// computador, o mesmo desenho de "Ver todos os anúncios ativos".
//
// Texto em linguagem de dono de loja. As ressalvas técnicas moram aqui, não espalhadas pela tela.

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BarChart3, Globe, LayoutDashboard, Scale, TrendingUp, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PalavrasResultado } from "@/lib/portal/formatos";

interface Secao { icone: LucideIcon; titulo: string; itens: { termo: string; texto: string }[] }

export function secoesDeComoContamos({ temResumo, temAnuncios, temGoogle, temInstagram, palavras }: {
  temResumo: boolean; temAnuncios: boolean; temGoogle: boolean; temInstagram: boolean; palavras: PalavrasResultado;
}): Secao[] {
  return [
    ...(temResumo ? [{
      icone: LayoutDashboard, titulo: "Visão geral",
      itens: [
        { termo: "Por que os números não se somam", texto: `Cada canal conta uma coisa diferente: ${palavras.um} de anúncio, contato pelo Google e seguidor novo não são a mesma coisa. Por isso cada um aparece com o próprio número.` },
        { termo: "A frase do topo", texto: "Só cita o canal que teve resultado no período. Canal sem resultado, ou que ainda está sendo atualizado, fica de fora." },
      ],
    }] : []),
    ...(temAnuncios ? [{
      icone: BarChart3, titulo: "Anúncios (Facebook e Instagram)",
      itens: [
        { termo: palavras.Varios, texto: `Contam quem agiu até 7 dias depois de clicar no anúncio, ou no dia em que o viu. É gente que procurou a sua empresa — ainda não é uma venda.` },
        { termo: palavras.custo, texto: `O valor investido dividido pelo número de ${palavras.varios} do mesmo período.` },
        { termo: "Pessoas alcançadas", texto: "Pessoas diferentes que viram pelo menos um anúncio. Não some com o alcance do Instagram: a mesma pessoa pode estar nos dois." },
        { termo: "Diferença para o Gerenciador de Anúncios", texto: "Pode chegar a 5%, porque a Meta ainda ajusta os dias mais recentes." },
      ],
    }] : []),
    ...(temGoogle ? [{
      icone: Globe, titulo: "Google",
      itens: [
        { termo: "Ligações, rotas e cliques no site", texto: "São toques nos botões do seu perfil no Google. A ligação conta quando a pessoa toca em ligar — não quer dizer que foi atendida." },
        { termo: "Dias mais recentes", texto: "O Google leva de 2 a 3 dias para fechar os números do perfil. Quando isso muda o período mostrado, a área avisa." },
        { termo: "O que pesquisaram", texto: "O Google só entrega os termos de busca fechados por mês." },
        { termo: "Anúncios no Google", texto: "Mostramos cliques, vezes que o anúncio apareceu e toques no botão de ligar — números que você consegue conferir." },
      ],
    }] : []),
    ...(temInstagram ? [{
      icone: TrendingUp, titulo: "Instagram",
      itens: [
        { termo: "Seguidores no período", texto: "Quem começou a seguir menos quem deixou de seguir nos mesmos dias." },
        { termo: "Pessoas alcançadas", texto: "Pessoas diferentes que viram o perfil, os posts ou os Stories. Inclui quem chegou pelos anúncios." },
        { termo: "Visualizações", texto: "Quantas vezes o conteúdo foi visto. A mesma pessoa pode ver mais de uma vez." },
        { termo: "Toques nos botões", texto: "Quantas vezes alguém tocou em ligar, mensagem ou como chegar no seu perfil." },
      ],
    }] : []),
    {
      icone: Scale, titulo: "Comparações",
      itens: [
        { termo: "Subiu ou caiu", texto: "Toda variação compara com o período anterior do mesmo tamanho (7 dias com os 7 dias de antes)." },
        { termo: "Estável", texto: "Diferença de até 5% para cima ou para baixo." },
        { termo: "Custo caindo é bom", texto: "No custo, a seta para baixo aparece em verde. Investimento não é bom nem ruim: aparece sem cor." },
      ],
    },
  ];
}

export default function ComoContamos({ children, ...quais }: {
  /** O botão que abre a folha. */
  children: ReactNode;
  temResumo: boolean; temAnuncios: boolean; temGoogle: boolean; temInstagram: boolean; palavras: PalavrasResultado;
}) {
  const secoes = secoesDeComoContamos(quais);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            "fixed z-[70] flex flex-col border-border bg-background text-foreground shadow-lg focus:outline-none",
            // Celular: gaveta de baixo. Computador: painel da direita.
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[460px] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0",
            "duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right",
            "motion-reduce:animate-none",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lone-h1 font-semibold tracking-tight text-foreground">Como contamos os números</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-lone-caption text-muted-foreground">
                O que cada número do seu painel quer dizer, canal por canal.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Fechar">
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
            {secoes.map((s) => {
              const Icone = s.icone;
              return (
                <section key={s.titulo}>
                  <h3 className="flex items-center gap-2 text-lone-h2 tracking-tight text-foreground">
                    <Icone size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                    {s.titulo}
                  </h3>
                  <dl className="mt-3 space-y-3">
                    {s.itens.map((i) => (
                      <div key={i.termo} className="rounded-xl border border-border bg-card px-4 py-3">
                        <dt className="text-sm font-medium text-foreground">{i.termo}</dt>
                        <dd className="mt-1 text-sm text-muted-foreground">{i.texto}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
