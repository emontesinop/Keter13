import { Chess } from "chess.js";
import { sp, t, type OpeningNode, type Repertoire, type Txt } from "./openings";

export interface StructureCard {
  id: string;
  name: Txt;
  description: Txt;
  /** SAN moves from the initial position that reach a typical position of this structure */
  exampleLine?: string[];
  plans: { white: Txt[]; black: Txt[] };
  pieces: Txt;
  endgame: Txt;
  mistakes: Txt[];
  /** "Find the thematic move" exercise: side to move after `line` should play one of `answers` */
  quiz?: { line: string[]; answers: string[]; prompt: Txt; explanation: Txt };
  conceptIds?: string[];
}

/**
 * Pawn structures are what makes openings understandable: the same plans repeat across many move orders.
 * Descriptions are original; the structure names follow standard chess terminology.
 */
export const PAWN_STRUCTURES: StructureCard[] = [
  {
    id: "carlsbad", name: t("Estructura Carlsbad", "Carlsbad structure"),
    description: t("Blancas: a2-b2-d4-e3 (sin peón c); negras: a7-b7-c6-d5 (sin peón e). Nace del Gambito de Dama del cambio y de la Caro-Kann del cambio.",
      "White: a2-b2-d4-e3 (no c-pawn); Black: a7-b7-c6-d5 (no e-pawn). Arises from the Exchange QGD and the Exchange Caro-Kann."),
    exampleLine: sp("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7 Qc2 O-O Nf3 Re8 O-O Nf8"),
    plans: {
      white: [t("Ataque de minorías: Tb1, b4-b5 y bxc6 para dejar un peón débil en c6 o d5.", "Minority attack: Rb1, b4-b5 and bxc6 to leave a weak pawn on c6 or d5."), t("Alternativa: f3 y e4 para tomar el centro.", "Alternative: f3 and e4 to take over the centre.")],
      black: [t("Ataque en el flanco de rey: ...Ce4, ...f5, ...Cf8-g6, ...Dh4.", "Kingside play: ...Ne4, ...f5, ...Nf8-g6, ...Qh4."), t("Frenar el ataque de minorías con ...a5 o ...b5 en el momento justo.", "Meet the minority attack with ...a5 or ...b5 at the right moment.")],
    },
    pieces: t("Caballo blanco ideal en e5 o c5; caballo negro en e4. El alfil 'malo' negro de c8 queda libre tras el cambio en d5.", "Ideal white knight on e5 or c5; black knight on e4. Black's c8-bishop is freed by the exchange on d5."),
    endgame: t("Si el ataque de minorías deja un peón débil en c6, los finales favorecen a las blancas.", "If the minority attack leaves a weak c6-pawn, endgames favour White."),
    mistakes: [t("Negras: permitir b5xc6 sin reaccionar.", "Black: allowing b5xc6 without reacting."), t("Blancas: lanzar el ataque de minorías ignorando la amenaza al propio rey.", "White: launching the minority attack while ignoring threats to your own king.")],
    quiz: { line: sp("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7 Qc2 O-O Nf3 Re8 O-O Nf8"), answers: ["Rab1", "b4"],
      prompt: t("Blancas juegan. ¿Cómo empieza el plan típico en el flanco de dama?", "White to move. How does the typical queenside plan begin?"),
      explanation: t("Tab1 y b4-b5: el ataque de minorías. Dos peones contra tres para crear una debilidad en c6.", "Rab1 and b4-b5: the minority attack. Two pawns against three to create a weakness on c6.") },
    conceptIds: ["pawn-weaknesses"],
  },
  {
    id: "iqp", name: t("Peón aislado de dama (PDA)", "Isolated queen's pawn (IQP)"),
    description: t("Un peón en d4 (o d5) sin peones en las columnas c y e. Da actividad y espacio, pero es una debilidad a largo plazo.", "A pawn on d4 (or d5) with no pawns on the c- and e-files. It gives activity and space but is a long-term weakness."),
    exampleLine: sp("e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5 Bd3 Nc6 O-O O-O Re1"),
    plans: {
      white: [t("Bando con PDA: ataque al rey (Ce5, Ac2 + Dd3, Tf3-h3) y ruptura d4-d5 para liberar las piezas.", "IQP side: king attack (Ne5, Bc2 + Qd3, Re3-h3) and the d4-d5 break to free the pieces.")],
      black: [t("Defensor: bloquear la casilla d5 (un caballo es el bloqueador ideal), cambiar piezas menores y llevar la partida al final.", "Defender: blockade d5 (a knight is the ideal blockader), trade minor pieces and head for the endgame.")],
    },
    pieces: t("El defensor quiere un caballo en d5; el bando del PDA quiere caballos en e5 y c5.", "The defender wants a knight on d5; the IQP side wants knights on e5 and c5."),
    endgame: t("Con pocas piezas el PDA suele ser solo una debilidad: el defensor está mejor.", "With few pieces left the IQP is usually just a weakness: the defender is better."),
    mistakes: [t("Con PDA: cambiar piezas sin motivo.", "With the IQP: trading pieces for no reason."), t("Defensor: abrir el juego antes de controlar d5.", "Defender: opening the game before controlling d5.")],
    conceptIds: ["iqp"],
  },
  {
    id: "french-chain", name: t("Cadena francesa", "French pawn chain"),
    description: t("Blancas d4-e5, negras e6-d5. Las blancas tienen espacio en el flanco de rey; las negras, juego en el de dama.", "White d4-e5, Black e6-d5. White has kingside space; Black has queenside play."),
    exampleLine: sp("e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6"),
    plans: {
      white: [t("Mantener d4 (c3, Cf3, Ae2/Ad3) y atacar en el flanco de rey.", "Hold d4 (c3, Nf3, Be2/Bd3) and attack on the kingside.")],
      black: [t("Atacar la base de la cadena (d4) con ...c5, ...Cc6, ...Db6, ...Cge7-f5; después la cabeza (e5) con ...f6.", "Attack the chain's base (d4) with ...c5, ...Nc6, ...Qb6, ...Nge7-f5; then its head (e5) with ...f6.")],
    },
    pieces: t("El alfil negro de c8 es 'malo' (sus peones en casillas blancas): cámbialo o actívalo vía d7-b5/a6.", "Black's c8-bishop is 'bad' (its pawns are on light squares): trade it or activate it via d7-b5/a6."),
    endgame: t("Si las negras ganan d4 o abren la columna c, los finales son buenos para ellas.", "If Black wins d4 or opens the c-file, endgames are good for Black."),
    mistakes: [t("Negras: no jugar ...c5 (pasividad).", "Black: never playing ...c5 (passivity)."), t("Blancas: entregar d4 sin compensación.", "White: giving up d4 without compensation.")],
    quiz: { line: sp("e4 e6 d4 d5 e5"), answers: ["c5"], prompt: t("Negras juegan. Las blancas avanzaron e5. ¿Cuál es la reacción estratégica correcta?", "Black to move. White has pushed e5. What is the correct strategic reaction?"),
      explanation: t("...c5: atacar la base de la cadena (d4) de inmediato.", "...c5: attack the base of the chain (d4) at once.") },
  },
  {
    id: "caro-advance", name: t("Caro-Kann Avanzada", "Caro-Kann Advance"),
    description: t("Como la cadena francesa, pero con el alfil negro ya fuera (…Af5) antes de ...e6: el problema del alfil malo está resuelto.", "Like the French chain, but Black's bishop is already out (...Bf5) before ...e6: the bad-bishop problem is solved."),
    exampleLine: sp("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2"),
    plans: { white: [t("Espacio y ataque: c3, Ae3, Cbd2, a veces g4 contra el alfil.", "Space and attack: c3, Be3, Nbd2, sometimes g4 against the bishop.")], black: [t("...c5 (gastando un tiempo extra, pero con el alfil bueno fuera), ...Cc6, ...Db6.", "...c5 (spending a tempo, but with the good bishop outside), ...Nc6, ...Qb6.")] },
    pieces: t("El Af5 negro es activo; vigila g4-h4 que pueden atraparlo.", "Black's f5-bishop is active; watch out for g4-h4 that can trap it."),
    endgame: t("Estructura sana para las negras: buenos finales si el centro blanco se debilita.", "Healthy structure for Black: good endgames if White's centre weakens."),
    mistakes: [t("Negras: retrasar ...c5.", "Black: delaying ...c5."), t("Dejar el alfil sin casilla de retirada frente a g4 y h4.", "Leaving the bishop without a retreat against g4 and h4.")],
    quiz: { line: sp("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2"), answers: ["c5"], prompt: t("Negras juegan. ¿Cuál es la ruptura que define la Avanzada?", "Black to move. Which break defines the Advance?"), explanation: t("...c5 contra d4: misma lógica que en la Francesa.", "...c5 against d4: the same logic as in the French.") },
  },
  {
    id: "caro-classical", name: t("Caro-Kann Clásica", "Caro-Kann Classical"),
    description: t("Sin peones e: el peón d4 blanco da espacio; las negras tienen una estructura sin debilidades (c6, e6).", "No e-pawns: White's d4-pawn gives space; Black has a structure without weaknesses (c6, e6)."),
    exampleLine: sp("e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6"),
    plans: { white: [t("Enroque largo y ataque con el peón h5 y Ce5/Ce4.", "Long castling and an attack with the h5-pawn and Ne5/Ne4.")], black: [t("...Cgf6, ...Dc7, ...0-0-0 o ...0-0 según el ataque; ruptura ...c5.", "...Ngf6, ...Qc7, ...O-O-O or ...O-O depending on the attack; the ...c5 break.")] },
    pieces: t("El peón h5 blanco fija g6 pero puede caer en el final.", "White's h5-pawn fixes g6 but can fall in the endgame."),
    endgame: t("Los finales suelen favorecer a las negras si el peón h5 queda débil.", "Endgames often favour Black if the h5-pawn becomes weak."),
    mistakes: [t("Negras: enrocar corto ante un ataque preparado.", "Black: castling short into a prepared attack.")],
  },
  {
    id: "najdorf", name: t("Najdorf / Scheveningen", "Najdorf / Scheveningen"),
    description: t("Las negras sin peón c, con d6 (y e5 o e6) frente al peón e4 blanco. Mayoría central negra, columna c semiabierta.", "Black without a c-pawn, with d6 (and e5 or e6) against White's e4. Black has a central majority and the half-open c-file."),
    exampleLine: sp("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4"),
    plans: { white: [t("Ataque con peones en el flanco de rey (f3, g4-g5, h4) y control de d5.", "Pawn storm on the kingside (f3, g4-g5, h4) and control of d5.")], black: [t("Contrataque ...b5-b4 y ruptura liberadora ...d5.", "Counter-attack ...b5-b4 and the freeing ...d5 break.")] },
    pieces: t("Con ...e5, la casilla d5 es clave para ambos: un caballo blanco ahí es fuerte, salvo que puedas cambiarlo.", "With ...e5, d5 is key for both: a white knight there is strong unless you can trade it."),
    endgame: t("Tras ...d5 con éxito, la mayoría central negra suele dar ventaja en el final.", "After a successful ...d5, Black's central majority often favours Black in the endgame."),
    mistakes: [t("Negras: ...e5 sin controlar d5.", "Black: ...e5 without controlling d5."), t("Llegar tarde a la carrera de ataques.", "Arriving late in the attacking race.")],
    quiz: { line: sp("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4"), answers: ["b5", "d5"], prompt: t("Negras juegan; las blancas enrocaron largo y avanzan g4. ¿Cuál es tu contrajuego?", "Black to move; White castled long and pushed g4. What's your counterplay?"),
      explanation: t("...b5 (ataque con peones en el flanco de dama) o ...d5 (ruptura central). Defenderse pasivamente pierde la carrera.", "...b5 (queenside pawn storm) or ...d5 (central break). Passive defence loses the race.") },
  },
  {
    id: "kid-closed", name: t("India de Rey cerrada", "Closed King's Indian"),
    description: t("Cadenas opuestas: blancas c4-d5-e4, negras d6-e5. Cada bando ataca donde apunta su cadena.", "Opposing chains: White c4-d5-e4, Black d6-e5. Each side attacks where its chain points."),
    exampleLine: sp("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3"),
    plans: { white: [t("Flanco de dama: c5, Cd3, Tc1, cxd6 para abrir la columna c.", "Queenside: c5, Nd3, Rc1, cxd6 to open the c-file.")], black: [t("Flanco de rey: ...f5, ...f4, ...g5-g4 y sacrificios contra el enroque.", "Kingside: ...f5, ...f4, ...g5-g4 and sacrifices against the castled king.")] },
    pieces: t("El Ag7 negro parece malo, pero defiende y se activa tras ...f4-g5.", "Black's g7-bishop looks bad but defends, and wakes up after ...f4-g5."),
    endgame: t("Si el ataque negro se estanca, el final suele ser malo para las negras (peones en casillas oscuras).", "If Black's attack stalls, the endgame is usually bad for Black (pawns on dark squares)."),
    mistakes: [t("Negras: jugar en el flanco de dama, donde las blancas son más fuertes.", "Black: playing on the queenside where White is stronger.")],
    quiz: { line: sp("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3"), answers: ["f5"], prompt: t("Negras juegan. El centro está cerrado. ¿Por dónde atacas?", "Black to move. The centre is closed. Where do you attack?"), explanation: t("...f5: la cadena negra apunta al flanco de rey; ahí está tu ataque.", "...f5: Black's chain points to the kingside; that's where your attack is.") },
  },
  {
    id: "slav-structure", name: t("Estructura Eslava", "Slav structure"),
    description: t("Negras c6-d5-e6 con el alfil fuera en f5/g6. Muy sólida; las blancas buscan e4.", "Black c6-d5-e6 with the bishop outside on f5/g6. Very solid; White aims for e4."),
    exampleLine: sp("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O Qe2 Nbd7"),
    plans: { white: [t("Ruptura e4 con apoyo de Dd2/De2 y Td1.", "The e4 break supported by Qe2 and Rd1.")], black: [t("Contener e4 (…Ab4, …Ag6) y liberar con ...e5 o ...c5.", "Restrain e4 (...Bb4, ...Bg6) and free with ...e5 or ...c5.")] },
    pieces: t("El alfil de f5 es la pieza que diferencia la Eslava del GDD.", "The f5-bishop is what distinguishes the Slav from the QGD."),
    endgame: t("Estructura sin debilidades para las negras.", "A structure without weaknesses for Black."),
    mistakes: [t("Negras: perder tiempos con el alfil frente a Ch4/Db3.", "Black: losing time with the bishop against Nh4/Qb3.")],
    quiz: { line: sp("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O Qe2 Nbd7"), answers: ["e4"], prompt: t("Blancas juegan. ¿Cuál es la ruptura central que buscan las blancas?", "White to move. What central break is White aiming for?"), explanation: t("e4: gana el centro y expulsa el alfil de f5.", "e4: grabs the centre and kicks the f5-bishop.") },
  },
  {
    id: "open-e5", name: t("Juegos abiertos (e4/e5)", "Open games (e4/e5)"),
    description: t("Centro simétrico; en la Italiana y Española modernas, d3/d6 con maniobras lentas y ruptura d4.", "Symmetrical centre; in the modern Italian and Ruy, d3/d6 with slow manoeuvres and the d4 break."),
    exampleLine: sp("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3 h6"),
    plans: { white: [t("Cbd2-f1-g3, ruptura d4 preparada; a4 en el flanco de dama.", "Nbd2-f1-g3, a prepared d4 break; a4 on the queenside.")], black: [t("Simétrico: ...Ce7-g6, ...c6 y ...d5 o ...Ae6 para cambiar el Ab3.", "Mirror: ...Ne7-g6, ...c6 and ...d5, or ...Be6 to trade the b3-bishop.")] },
    pieces: t("Los alfiles en las diagonales a2-g8 / a7-g1 apuntan a f7/f2: cuidado con los sacrificios en esas casillas.", "Bishops on a2-g8 / a7-g1 aim at f7/f2: watch for sacrifices on those squares."),
    endgame: t("Finales equilibrados: deciden la estructura tras d4 y la actividad.", "Balanced endgames: structure after d4 and activity decide."),
    mistakes: [t("Abrir el centro (d4) sin haber completado el desarrollo.", "Opening the centre (d4) before completing development.")],
    quiz: { line: sp("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3 h6"), answers: ["Nbd2"], prompt: t("Blancas juegan. ¿Cómo mejoras tu pieza menos activa?", "White to move. How do you improve your least active piece?"), explanation: t("Cbd2 (y luego f1-g3): el caballo de b1 va al flanco de rey sin bloquear al alfil de c1.", "Nbd2 (then f1-g3): the b1-knight heads to the kingside without blocking the c1-bishop.") },
  },
  {
    id: "london-triangle", name: t("Triángulo del Londres", "London triangle"),
    description: t("Blancas c3-d4-e3 con el alfil fuera en f4/g3. Muy sólido; el plan clásico es Ce5 + f4.", "White c3-d4-e3 with the bishop outside on f4/g3. Very solid; the classic plan is Ne5 + f4."),
    exampleLine: sp("d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 b6"),
    plans: { white: [t("Ce5, f4 (estructura tipo Stonewall), Tf3-h3 o Df3-h3.", "Ne5, f4 (Stonewall-type), Rf3-h3 or Qf3-h3."), t("O ruptura central e4.", "Or the central e4 break.")], black: [t("Presión en el flanco de dama: ...c5-c4, ...b5-b4; o ...Cd7 para discutir e5.", "Queenside pressure: ...c5-c4, ...b5-b4; or ...Nd7 to challenge e5.")] },
    pieces: t("Un caballo en e5 apoyado por f4 es la pieza clave del ataque.", "A knight on e5 supported by f4 is the key attacking piece."),
    endgame: t("Si las negras cambian el caballo de e5, la casilla e4 puede quedar débil para las blancas.", "If Black trades the e5-knight, e4 may become weak for White."),
    mistakes: [t("Blancas: jugar en piloto automático sin mirar el plan rival en el flanco de dama.", "White: playing on autopilot, ignoring Black's queenside plan.")],
    quiz: { line: sp("d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 b6"), answers: ["Ne5"], prompt: t("Blancas juegan. ¿Cuál es la jugada característica del plan de ataque?", "White to move. What's the trademark move of the attacking plan?"), explanation: t("Ce5: el caballo ocupa e5, seguido de f4 y el ataque en el flanco de rey.", "Ne5: the knight occupies e5, followed by f4 and a kingside attack.") },
  },
  {
    id: "hanging-pawns", name: t("Peones colgantes", "Hanging pawns"),
    description: t("Dos peones unidos en c y d (p. ej. c5/d5) sin peones vecinos en b y e. Son dinámicos mientras puedan avanzar; si quedan bloqueados, son un blanco.", "Two connected pawns on the c- and d-files (e.g. c5/d5) with no neighbours on b and e. Dynamic while they can advance; a target once blockaded."),
    plans: { white: [t("Atacarlos con piezas (Tc1, Td1, Ca4/Ce5) y forzar a uno a avanzar, creando casillas débiles.", "Attack them with pieces (Rc1, Rd1, Na4/Ne5) and force one to advance, creating weak squares.")], black: [t("Mantenerlos uno al lado del otro y buscar el avance ...d4 o ...c4 en el momento oportuno.", "Keep them side by side and look for ...d4 or ...c4 at the right moment.")] },
    pieces: t("Las torres en las columnas c y d deciden la lucha.", "Rooks on the c- and d-files decide the fight."),
    endgame: t("Con pocas piezas suelen ser débiles: el bando que los tiene evita los cambios.", "With few pieces left they're usually weak: their owner avoids trades."),
    mistakes: [t("Avanzar uno de ellos sin necesidad: deja una casilla débil delante del otro.", "Advancing one without need: it leaves a weak square in front of the other.")],
  },
  {
    id: "nimzo-doubled-c", name: t("Peones c doblados (Nimzoindia)", "Doubled c-pawns (Nimzo-Indian)"),
    description: t("Tras ...Axc3 bxc3, las blancas tienen la pareja de alfiles y el centro, pero peones c doblados y debilitados.", "After ...Bxc3 bxc3, White has the bishop pair and the centre but doubled, weakened c-pawns."),
    exampleLine: sp("d4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3 c5"),
    plans: { white: [t("Abrir el juego para los alfiles: e4, f3 y ataque en el flanco de rey.", "Open the game for the bishops: e4, f3 and a kingside attack.")], black: [t("Bloquear y atacar c4: ...c5, ...b6, ...Aa6, ...Cc6-a5.", "Blockade and attack c4: ...c5, ...b6, ...Ba6, ...Nc6-a5.")] },
    pieces: t("Caballos negros contra alfiles blancos: posiciones cerradas favorecen a las negras.", "Black's knights against White's bishops: closed positions favour Black."),
    endgame: t("El peón c4 doblado suele caer en el final.", "The doubled c4-pawn often falls in the endgame."),
    mistakes: [t("Negras: abrir el centro y liberar los alfiles blancos.", "Black: opening the centre and freeing White's bishops.")],
  },
  {
    id: "reversed-sicilian", name: t("Siciliana invertida (Inglesa)", "Reversed Sicilian (English)"),
    description: t("La Inglesa contra ...e5 es una Siciliana con colores cambiados y un tiempo de más para las blancas.", "The English against ...e5 is a Sicilian with colours reversed and an extra tempo for White."),
    exampleLine: sp("c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3"),
    plans: { white: [t("Presión en la gran diagonal y expansión b4-b5.", "Pressure on the long diagonal and b4-b5 expansion.")], black: [t("Centro con ...e5 y desarrollo clásico; ...f5 a veces.", "Centre with ...e5 and classical development; sometimes ...f5.")] },
    pieces: t("El Ag2 blanco es la pieza clave.", "White's g2-bishop is the key piece."),
    endgame: t("Columna c semiabierta para las blancas.", "Half-open c-file for White."),
    mistakes: [t("Pasividad: dejar que las negras consoliden un gran centro.", "Passivity: letting Black consolidate a big centre.")],
  },
];

export const structureById = (id: string) => PAWN_STRUCTURES.find((s) => s.id === id);

export function lineFen(sans: string[]): string {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
}

/** Universal opening principles — the "why" behind almost every good opening move. */
export const OPENING_PRINCIPLES: { title: Txt; why: Txt }[] = [
  { title: t("Controla el centro", "Control the centre"), why: t("Las piezas centralizadas atacan más casillas y llegan antes a ambos flancos. Se controla con peones (e4/d4) o a distancia (fianchetto, c4, ...c5).", "Central pieces cover more squares and reach both wings faster. You can control it with pawns (e4/d4) or from afar (fianchetto, c4, ...c5).") },
  { title: t("Desarrolla con propósito", "Develop with purpose"), why: t("Cada jugada debe sacar una pieza a una casilla donde haga algo: atacar el centro, preparar el enroque o apoyar una ruptura.", "Every move should bring a piece to a square where it does something: hit the centre, prepare castling or support a break.") },
  { title: t("Pon el rey a salvo", "Get your king safe"), why: t("El enroque protege al rey y conecta las torres. Retrasarlo con el centro abierto es la causa nº1 de derrotas rápidas.", "Castling protects the king and connects the rooks. Delaying it with an open centre is the #1 cause of quick losses.") },
  { title: t("No muevas la misma pieza dos veces sin motivo", "Don't move the same piece twice without reason"), why: t("Cada tiempo perdido es una pieza menos en juego. Excepción: si el rival comete un error o la jugada gana algo concreto.", "Each lost tempo is one less piece in play. Exception: the opponent errs or the move wins something concrete.") },
  { title: t("No saques la dama demasiado pronto", "Don't bring the queen out too early"), why: t("Las piezas menores la persiguen ganando tiempos.", "Minor pieces chase it, gaining tempi.") },
  { title: t("Conoce tu ruptura de peones", "Know your pawn break"), why: t("Cada estructura tiene 1–2 rupturas (…c5 en la Francesa, ...f5 en la India de Rey, b4-b5 en la Carlsbad). Saberlas vale más que memorizar 10 jugadas.", "Each structure has 1–2 breaks (...c5 in the French, ...f5 in the King's Indian, b4-b5 in the Carlsbad). Knowing them is worth more than memorising 10 moves.") },
  { title: t("Saca los alfiles antes de cerrarlos", "Develop bishops before locking them in"), why: t("Por eso Af4 antes de e3 en el Londres y ...Af5 antes de ...e6 en la Caro-Kann y la Eslava.", "That's why Bf4 comes before e3 in the London, and ...Bf5 before ...e6 in the Caro-Kann and Slav.") },
  { title: t("Ante una jugada desconocida, vuelve a los principios", "Facing an unknown move, return to principles"), why: t("Pregunta: ¿qué amenaza?, ¿qué debilita?, ¿cómo me desarrollo mejor? Casi siempre hay una respuesta sana sin teoría.", "Ask: what does it threaten? what does it weaken? how do I develop best? There's almost always a healthy, theory-free answer.") },
];

export interface IdeaQuestion { repId: string; path: string[]; san: string; fen: string; correct: Txt; options: Txt[]; answerIndex: number; }

/** "Why this move?" multiple-choice: the right idea vs ideas taken from other positions. */
export function buildIdeaQuestion(reps: Repertoire[], repId: string, rand: () => number = Math.random): IdeaQuestion | null {
  const all: { repId: string; path: string[]; node: OpeningNode }[] = [];
  const walk = (rid: string, ns: OpeningNode[], path: string[]) => { for (const n of ns) { const p = [...path, n.san]; if (n.idea) all.push({ repId: rid, path: p, node: n }); if (n.children) walk(rid, n.children, p); } };
  for (const r of reps) walk(r.id, r.tree, []);
  const mine = all.filter((x) => x.repId === repId);
  if (!mine.length || all.length < 4) return null;
  const q = mine[Math.floor(rand() * mine.length)];
  const pool = all.filter((x) => x.node.idea!.es !== q.node.idea!.es && x.node.san !== q.node.san);
  const distractors: Txt[] = [];
  while (distractors.length < 3 && pool.length) {
    const d = pool.splice(Math.floor(rand() * pool.length), 1)[0].node.idea!;
    if (!distractors.some((x) => x.es === d.es)) distractors.push(d);
  }
  const answerIndex = Math.floor(rand() * (distractors.length + 1));
  const options = [...distractors];
  options.splice(answerIndex, 0, q.node.idea!);
  return { repId, path: q.path, san: q.node.san, fen: lineFen(q.path.slice(0, -1)), correct: q.node.idea!, options, answerIndex };
}
