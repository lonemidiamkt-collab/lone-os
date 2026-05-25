import Image from "next/image";

/**
 * Componente global da logo da Lone Midia.
 *
 * Fonte única de verdade: `/public/logo.png` (500x500, RGBA, símbolo LM azul).
 * Use `className` com tailwind pra controlar o tamanho (w-X h-X).
 *
 * Exemplos:
 *   <Logo className="w-7 h-7" />           // header / sidebar (pequeno)
 *   <Logo className="w-12 h-12" />         // avatar / card
 *   <Logo className="w-20 h-20" />         // login / splash
 *   <Logo className="w-14 h-14 rounded-2xl" />  // com frame
 *
 * Para trocar a logo em todo o sistema, basta substituir o arquivo
 * `public/logo.png`. Tudo atualiza instantaneamente (incluindo favicon e OG).
 */
interface LogoProps {
  /** Tailwind classes para tamanho/estilo (default w-8 h-8). */
  className?: string;
  /** Alt text para acessibilidade. */
  alt?: string;
  /**
   * Prioriza o carregamento (LCP). Use true apenas em above-the-fold:
   * login, header, hero. Default = false.
   */
  priority?: boolean;
}

export function Logo({
  className = "w-8 h-8",
  alt = "Lone Midia",
  priority = false,
}: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={500}
      height={500}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
