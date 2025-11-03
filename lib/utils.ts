import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type PoliticalFigure = "bolsonaro" | "lula";
export type FriendGender = "homem" | "mulher";

export function buildComposePrompt(figure: PoliticalFigure, gender?: FriendGender): string {
  const name = figure === "bolsonaro" ? "Jair Bolsonaro" : "Luiz Inácio Lula da Silva";
  const genderLine = gender
    ? (gender === "homem"
        ? "A pessoa da foto é um HOMEM adulto."
        : "A pessoa da foto é uma MULHER adulta.") + " "
    : "";
  // Regras adicionais específicas quando a figura é Lula para evitar mistura de identidades
  const lulaSafeguards = figure === "lula"
    ? (
      `RESTRIÇÃO CRÍTICA (Lula): Lula deve aparecer como SEGUNDA pessoa distinta, ` +
      `ao lado/abraçando a pessoa da foto. NÃO transforme a pessoa da foto em Lula. ` +
      `NÃO misture traços do Lula no rosto da pessoa da foto. Evite qualquer fusão ` +
      `de identidades. A pessoa da foto mantém 100% da sua fisionomia original. ` +
      `Lula pode ter barba grisalha curta, cabelo grisalho curto, traços e idade coerentes, ` +
      `mas esses traços NÃO devem migrar para a pessoa da foto. `
    ) : "";

  return (
    // Contexto e tarefa
    `Você recebeu UMA foto de referência. ${genderLine}Gere uma nova IMAGEM FOTORREALISTA ` +
    `onde a MESMA pessoa da foto aparece abraçando ${name}. ` +
    lulaSafeguards +
    // Âncora de identidade (má prioridade na semelhança)
    `A foto de referência é a âncora de identidade e deve ter prioridade máxima. ` +
    `Replique a MESMA pessoa (mesma fisionomia), não gere um rosto genérico. ` +
    // Restrições de rosto e geometria
    `Preserve: formato do rosto, distância olhos-nariz-boca, linha do maxilar, sobrancelhas, ` +
    `textura da pele (poros), cicatrizes/sinais, linhas do sorriso, formato dos lábios e nariz, ` +
    `penteado, implante capilar/volume e tipo de barba quando houver. ` +
    // Iluminação/perspectiva/pose
    `Harmonize iluminação e direção de luz com a foto original. ` +
    `Mantenha a pose e a perspectiva do rosto o mais próximas possível. ` +
    // Mãos/anatomia
    `Mãos e braços anatômicos, número correto de dedos, sem deformações. ` +
    // Composição
    `Crie um fundo coerente e natural, sem artefatos, ` +
    `com profundidade e cores realistas. ` +
    // Evitar problemas comuns
    `Evite: suavização excessiva, pele plástica, duplicação de pessoas, ` +
    `olhos desalinhados, dentes borrados, marcas d'água, textos ou logos. ` +
    // Estilo/saída
    `Estética fotográfica com nitidez natural (não exagerar em sharpening). ` +
    `Formato final: foto em alta qualidade, proporção 1:1 ou 4:5. ` +
    // Instrução explícita de uso da imagem
    `USE a imagem de referência como CONTEÚDO DE CONDIÇÃO para garantir a semelhança do rosto. `
  );
}
