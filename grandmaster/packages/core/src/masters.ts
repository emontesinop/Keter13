import type { Txt } from "./openings";

export interface CriticalStop { ply: number; question: Txt; lesson: Txt; }
export interface MasterGame {
  id: string;
  white: string; black: string; event: string; year: number;
  opening: string;
  themes: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  objective: Txt;
  pgnMoves: string; // SAN movetext
  result: string;
  stops: CriticalStop[];
  license: string;
}
const t = (es: string, en: string): Txt => ({ es, en });

/**
 * Nineteenth-century games: the moves are historical facts in the public domain. Annotations are original.
 * Users can import further PGN collections (e.g. their own licensed databases) through the PGN importer.
 */
export const MASTER_GAMES: MasterGame[] = [
  {
    id: "morphy-opera-1858", white: "Paul Morphy", black: "Duke Karl / Count Isouard", event: "Paris (Opera)", year: 1858, opening: "Philidor Defence",
    themes: ["development", "open_lines", "sacrifice", "back_rank_mate"], difficulty: 2,
    objective: t("Ventaja de desarrollo: cómo convertir tiempos en un ataque decisivo.", "Development lead: converting tempi into a decisive attack."),
    pgnMoves: "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#",
    result: "1-0", license: "public domain (1858)",
    stops: [
      { ply: 19, question: t("Las negras han jugado ...b5 con piezas sin desarrollar. ¿Qué jugarías? Piensa en líneas abiertas hacia el rey negro.", "Black played ...b5 with undeveloped pieces. What would you play? Think about open lines toward Black's king."), lesson: t("Con gran ventaja de desarrollo, un sacrificio que abre líneas (Cxb5) vale más que el material.", "With a big development lead, a line-opening sacrifice (Nxb5) is worth more than material.") },
      { ply: 25, question: t("Todas tus piezas atacan la columna d. ¿Cómo eliminas al defensor clave?", "All your pieces aim at the d-file. How do you remove the key defender?"), lesson: t("Eliminar defensores (Txd7) para mantener la iniciativa.", "Remove defenders (Rxd7) to keep the initiative.") },
      { ply: 31, question: t("Busca la jugada que fuerza mate.", "Find the move that forces mate."), lesson: t("Sacrificio de dama para desviar el caballo: mate en la última fila.", "Queen sacrifice to deflect the knight: back-rank mate.") },
    ],
  },
  {
    id: "anderssen-kieseritzky-1851", white: "Adolf Anderssen", black: "Lionel Kieseritzky", event: "London (casual)", year: 1851, opening: "King's Gambit, Bishop's Gambit",
    themes: ["initiative", "sacrifice", "king_hunt", "mate"], difficulty: 4,
    objective: t("La 'Inmortal': actividad de las piezas frente a material.", "The 'Immortal': piece activity versus material."),
    pgnMoves: "1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#",
    result: "1-0", license: "public domain (1851)",
    stops: [
      { ply: 35, question: t("Ambas torres están atacadas. ¿Las salvas o encuentras algo más fuerte?", "Both rooks are attacked. Do you save them, or find something stronger?"), lesson: t("Ad6: cortar la retirada del alfil negro y controlar e7 vale más que dos torres cuando el rey rival no tiene defensores.", "Bd6: cutting off Black's bishop and controlling e7 matters more than two rooks when the enemy king has no defenders.") },
      { ply: 43, question: t("Tus piezas menores rodean al rey negro. ¿Cuál es el golpe final?", "Your minor pieces surround Black's king. What's the final blow?"), lesson: t("Sacrificio de dama para desviar el caballo de f6 y dar mate con piezas menores.", "Queen sacrifice to deflect the f6 knight and mate with minor pieces.") },
    ],
  },
  {
    id: "anderssen-dufresne-1852", white: "Adolf Anderssen", black: "Jean Dufresne", event: "Berlin (casual)", year: 1852, opening: "Evans Gambit",
    themes: ["gambit", "open_center", "combination", "mate"], difficulty: 4,
    objective: t("La 'Siempreviva': coordinación de torres y alfiles en el centro abierto.", "The 'Evergreen': coordinating rooks and bishops in an open centre."),
    pgnMoves: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#",
    result: "1-0", license: "public domain (1852)",
    stops: [
      { ply: 37, question: t("Las negras amenazan mate en g2. Encuentra la jugada tranquila que lo cambia todo.", "Black threatens mate on g2. Find the quiet move that changes everything."), lesson: t("Tad1: llevar la última pieza al ataque, aun ignorando una amenaza, cuando tus golpes son más rápidos (cálculo concreto).", "Rad1: bring the last piece into the attack, even ignoring a threat, when your blows come first (concrete calculation).") },
      { ply: 41, question: t("Busca el sacrificio que abre el camino al mate.", "Find the sacrifice that opens the way to mate."), lesson: t("Dxd7+: el sacrificio de dama elimina el último defensor; los alfiles cruzados dan mate.", "Qxd7+: the queen sacrifice removes the last defender; the bishops deliver mate.") },
    ],
  },
];
