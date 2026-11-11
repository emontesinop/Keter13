import type { Txt } from "./openings";

export interface EndgameDrill {
  id: string;
  title: Txt;
  category: "basic_mates" | "king_pawn" | "rook" | "minor" | "queen" | "defense";
  fen: string;
  /** side the user plays */
  side: "w" | "b";
  goal: "win" | "draw";
  difficulty: 1 | 2 | 3 | 4 | 5;
  concept: string; // knowledge-base id
  technique: Txt;
  /** max moves to achieve a win (practical target, not DTZ) */
  moveLimit?: number;
}

const t = (es: string, en: string): Txt => ({ es, en });

/** Theoretical results are verified by an engine test (apps/server/test/engine-content.test.ts). */
export const ENDGAME_DRILLS: EndgameDrill[] = [
  { id: "kq-k", title: t("Mate de dama", "Queen mate"), category: "basic_mates", fen: "8/8/8/4k3/8/8/8/4K2Q w - - 0 1", side: "w", goal: "win", difficulty: 1, concept: "basic-mates", moveLimit: 12,
    technique: t("Reduce la caja del rey con la dama a salto de caballo, acerca tu rey y cuidado con el ahogado.", "Shrink the king's box with the queen a knight's jump away, bring your king, beware stalemate.") },
  { id: "kr-k", title: t("Mate de torre", "Rook mate"), category: "basic_mates", fen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1", side: "w", goal: "win", difficulty: 1, concept: "basic-mates", moveLimit: 20,
    technique: t("Corta al rey con la torre, usa la oposición con tu rey y empuja fila a fila.", "Cut the king off with the rook, use opposition with your king and push rank by rank.") },
  { id: "kp-6th", title: t("Rey en sexta delante del peón", "King on the 6th ahead of the pawn"), category: "king_pawn", fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", side: "w", goal: "win", difficulty: 2, concept: "opposition",
    technique: t("Con el rey en la sexta delante de un peón (no torre), se gana tenga quien tenga el turno: usa la oposición.", "With the king on the 6th ahead of a (non-rook) pawn you win regardless of the move: use the opposition.") },
  { id: "kp-rookpawn", title: t("Peón de torre: tablas", "Rook pawn: draw"), category: "defense", fen: "k7/8/K7/P7/8/8/8/8 b - - 0 1", side: "b", goal: "draw", difficulty: 1, concept: "opposition",
    technique: t("Con un peón de torre, si el rey defensor alcanza la esquina, son tablas: oscila entre a8 y b8/b7.", "With a rook pawn, if the defending king reaches the corner it's a draw: shuttle between a8 and b8/b7.") },
  { id: "wrong-bishop", title: t("Alfil equivocado", "Wrong bishop"), category: "defense", fen: "7k/8/6KP/8/8/8/8/5B2 b - - 0 1", side: "b", goal: "draw", difficulty: 2, concept: "wrong-bishop",
    technique: t("El alfil no controla la casilla de coronación de la esquina: el rey defensor en h8 hace tablas.", "The bishop doesn't control the corner promotion square: the defending king on h8 draws.") },
  { id: "lucena", title: t("Posición de Lucena", "Lucena position"), category: "rook", fen: "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1", side: "w", goal: "win", difficulty: 3, concept: "lucena",
    technique: t("Construye el 'puente': Td1+, Td4 y usa la torre para cubrir los jaques laterales.", "Build the bridge: Rd1+, Rd4 and use the rook to block the side checks.") },
  { id: "philidor", title: t("Posición de Philidor", "Philidor position"), category: "rook", fen: "4k3/8/r7/4PK2/8/8/8/4R3 b - - 0 1", side: "b", goal: "draw", difficulty: 3, concept: "philidor",
    technique: t("Mantén la torre en tu tercera fila (la 6ª) hasta que el peón avance; entonces da jaques desde atrás.", "Keep the rook on your third rank (the 6th) until the pawn advances; then check from behind.") },
  { id: "kq-kp", title: t("Dama contra peón central en séptima", "Queen vs central pawn on the 7th"), category: "queen", fen: "8/8/8/8/8/8/1K1kp3/7Q w - - 0 1", side: "w", goal: "win", difficulty: 3, concept: "queen-vs-pawn",
    technique: t("Con jaques y clavadas obliga al rey a ponerse delante del peón; cada vez que lo hace, acerca tu rey una casilla.", "Use checks and pins to force the king in front of its pawn; each time, bring your king one step closer.") },
  { id: "kp-opposition", title: t("Oposición con peón de reserva", "Opposition with a spare tempo"), category: "king_pawn", fen: "8/8/3k4/8/3K4/3P4/8/8 w - - 0 1", side: "w", goal: "win", difficulty: 3, concept: "opposition",
    technique: t("El rey delante del peón y un tiempo de reserva con el peón permiten ganar la oposición.", "King in front of the pawn plus a spare pawn tempo lets you win the opposition.") },
];
