import type { PictoCard } from "./schema.ts";

export const deriveText = (card: PictoCard): string => {
  const glyphs: string[] = [];
  for (const op of card.ops) {
    if (op.t === "glyph") {
      glyphs.push(op.ch);
    }
  }
  return glyphs.join("");
};
