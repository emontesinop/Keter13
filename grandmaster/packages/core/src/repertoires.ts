import { LONDON, CARO_KANN, buildTree, matchRepertoire, sp, t, type Repertoire, type RepertoireMatch } from "./openings";

/**
 * Opening modules. Each one is taught through ideas, structures and plans; the move trees are kept short on purpose:
 * the goal is to reach a position you UNDERSTAND, not to memorise long engine lines.
 * All lines are validated as legal chess in tests.
 */

export const QUEENS_GAMBIT: Repertoire = {
  id: "queens-gambit", side: "w", group: "white", theoryLoad: 2, structureIds: ["carlsbad", "iqp", "slav-structure", "kid-closed"],
  name: t("Gambito de Dama (1.d4 2.c4)", "Queen's Gambit (1.d4 2.c4)"),
  style: t("Clásico y posicional: presión central duradera, juego en el flanco de dama.", "Classical and positional: lasting central pressure, queenside play."),
  summary: t("c4 ataca el centro negro desde el flanco. No es un gambito real: si ...dxc4, el peón se recupera. La idea es ganar influencia en d5 y abrir la columna c.",
    "c4 attacks Black's centre from the side. It's not a real gambit: after ...dxc4 the pawn is usually regained. The point is influence over d5 and the half-open c-file."),
  principles: [
    t("Presiona d5: Cc3, Ag5 (clavando el Cf6) y cxd5 en el momento adecuado.", "Pressure d5: Nc3, Bg5 (pinning the f6-knight) and cxd5 at the right moment."),
    t("Si las negras toman en c4, no persigas el peón: desarrolla (e3, Axc4) y recupéralo con naturalidad.", "If Black takes on c4, don't chase the pawn: develop (e3, Bxc4) and regain it naturally."),
    t("Decide la estructura: cxd5 crea la estructura Carlsbad (ataque de minorías); mantener la tensión deja más opciones.", "Choose the structure: cxd5 creates the Carlsbad structure (minority attack); keeping the tension keeps options."),
  ],
  structures: [t("Carlsbad tras cxd5 exd5.", "Carlsbad after cxd5 exd5."), t("Peón aislado de dama si se abre el centro con ...c5.", "Isolated queen's pawn if Black opens with ...c5.")],
  plans: [
    t("Ataque de minorías: Tb1, b4-b5 para crear un peón débil en c6.", "Minority attack: Rb1, b4-b5 to create a weak pawn on c6."),
    t("Ruptura central e4 con f3 cuando las piezas negras están en el flanco de dama.", "Central break e4 (with f3) when Black's pieces are on the queenside."),
  ],
  typicalMistakes: [
    t("Defender c4 con b3/b4 tras ...dxc4: debilita el flanco de dama.", "Defending c4 with b3/b4 after ...dxc4: it weakens the queenside."),
    t("Ignorar ...c5 o ...e5 liberadoras: si las negras rompen con comodidad, la ventaja desaparece.", "Ignoring the freeing ...c5 or ...e5 breaks: if Black frees comfortably, the edge disappears."),
  ],
  tree: buildTree([
    { sans: sp("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6"), name: "QGD: Tartakower", ideas: { 4: t("Cc3 presiona d5 y prepara Ag5.", "Nc3 pressures d5 and prepares Bg5."), 6: t("Ag5 clava el caballo que defiende d5.", "Bg5 pins the knight that defends d5."), 13: t("...b6 y ...Ab7: las negras atacan e4/d5 desde el flanco.", "...b6 and ...Bb7: Black eyes e4/d5 from the side.") } },
    { sans: sp("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7 Qc2"), name: "QGD: Exchange (Carlsbad)", ideas: { 6: t("cxd5 fija la estructura Carlsbad: tu plan será el ataque de minorías.", "cxd5 fixes the Carlsbad structure: your plan will be the minority attack."), 14: t("Dc2 controla h7 y e4; luego Cge2/Cf3, 0-0 y b4-b5.", "Qc2 eyes h7 and e4; then Nge2/Nf3, castle and b4-b5.") } },
    { sans: sp("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O Qe2"), name: "Slav main line", ideas: { 8: t("a4 impide ...b5, que defendería el peón de c4.", "a4 stops ...b5, which would defend the c4-pawn."), 12: t("Recuperas el peón con desarrollo; tu plan es e4.", "You regain the pawn with development; your plan is e4.") } },
    { sans: sp("d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6"), name: "Queen's Gambit Accepted", ideas: { 3: t("Gambito aceptado: desarrolla y recupera; las negras liberarán con ...c5.", "Accepted: develop and regain; Black will free with ...c5.") } },
    { sans: sp("d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3"), name: "vs Nimzo-Indian: 4.Qc2", ideas: { 6: t("Dc2: si ...Axc3, recapturas con la dama y conservas la estructura sana y la pareja de alfiles.", "Qc2: after ...Bxc3 you recapture with the queen, keeping a healthy structure and the bishop pair.") } },
    { sans: sp("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7"), name: "vs King's Indian: Classical", ideas: { 14: t("d5 cierra el centro: tú juegas en el flanco de dama (c5), las negras en el de rey (...f5).", "d5 closes the centre: you play on the queenside (c5), Black on the kingside (...f5).") } },
  ]),
};

export const ITALIAN: Repertoire = {
  id: "italian", side: "w", group: "white", theoryLoad: 2, structureIds: ["open-e5"],
  name: t("Italiana (1.e4 e5 2.Cf3 Cc6 3.Ac4)", "Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4)"),
  style: t("Maniobras lentas (Giuoco Pianissimo): c3, d3, Te1, Cbd2-f1-g3. Muy instructiva.", "Slow manoeuvring (Giuoco Pianissimo): c3, d3, Re1, Nbd2-f1-g3. Very instructive."),
  summary: t("El alfil apunta a f7, el punto débil negro. En el sistema moderno con c3 y d3 no se busca un ataque inmediato, sino preparar d4 y maniobrar mejor que el rival.",
    "The bishop eyes f7, Black's weak point. In the modern c3/d3 system you don't attack at once; you prepare d4 and out-manoeuvre the opponent."),
  principles: [
    t("c3 prepara d4 y da al alfil la retirada a c2 (vía b3).", "c3 prepares d4 and gives the bishop a retreat (via b3 to c2)."),
    t("h3 evita ...Ag4, la clavada molesta sobre Cf3.", "h3 prevents ...Bg4, the annoying pin on f3."),
    t("La maniobra Cbd2-f1-g3 lleva un caballo al flanco de rey sin bloquear el alfil c1.", "The Nbd2-f1-g3 manoeuvre brings a knight to the kingside without blocking the c1-bishop."),
  ],
  structures: [t("Estructura e4/d3 contra e5/d6: centro cerrado-semiabierto con rupturas d4 o b4-a4.", "e4/d3 vs e5/d6: semi-closed centre with the d4 or b4/a4 breaks.")],
  plans: [t("Ruptura d4 bien preparada; ataque en el flanco de rey con Cg3-f5.", "A well-prepared d4 break; kingside play with Ng3-f5."), t("Expansión en el flanco de dama con a4 y b4.", "Queenside expansion with a4 and b4.")],
  typicalMistakes: [t("Jugar d4 demasiado pronto y quedar con un centro débil.", "Playing d4 too early and ending up with a weak centre."), t("Dejar que ...Ag4 o ...Ca5 cambien tu alfil sin compensación.", "Letting ...Bg4 or ...Na5 trade your bishop off without compensation.")],
  tree: buildTree([
    { sans: sp("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3"), name: "Giuoco Pianissimo", ideas: { 4: t("Ac4 apunta a f7.", "Bc4 eyes f7."), 6: t("c3 prepara d4.", "c3 prepares d4."), 8: t("d3: primero desarrollo y solidez; d4 vendrá después.", "d3: development and solidity first; d4 comes later."), 16: t("h3 evita ...Ag4; ahora Cbd2-f1-g3.", "h3 prevents ...Bg4; next Nbd2-f1-g3.") } },
    { sans: sp("e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3"), name: "Two Knights with d3", ideas: { 6: t("d3 protege e4 y evita complicaciones forzadas (Cg5).", "d3 protects e4 and avoids forcing complications (Ng5).") } },
    { sans: sp("e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3"), name: "vs Petrov", ideas: { 4: t("Contra la Petrov: recuperas el peón y buscas ventaja de desarrollo.", "Against the Petrov: regain the pawn and seek a lead in development.") } },
    { sans: sp("e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7"), name: "vs Philidor", ideas: { 4: t("Contra la Philidor, d4 abre el centro: más espacio para ti.", "Against the Philidor, d4 opens the centre: more space for you.") } },
  ]),
};

export const RUY_LOPEZ: Repertoire = {
  id: "ruy-lopez", side: "w", group: "white", theoryLoad: 3, structureIds: ["open-e5"],
  name: t("Española / Ruy López (3.Ab5)", "Ruy Lopez (3.Bb5)"),
  style: t("Presión estratégica a largo plazo sobre e5; la escuela de los campeones del mundo.", "Long-term strategic pressure on e5; the world champions' school."),
  summary: t("Ab5 ataca al defensor de e5. La amenaza no es inmediata, pero condiciona todo el juego negro. Tras ...a6 el alfil suele retirarse a a4 y b3, presionando f7.",
    "Bb5 attacks the defender of e5. The threat isn't immediate but it shapes Black's whole game. After ...a6 the bishop usually retreats to a4 and b3, eyeing f7."),
  principles: [
    t("La presión sobre e5 obliga a las negras a decidir: mantener el punto fuerte o ceder el centro.", "Pressure on e5 forces Black to decide: hold the strongpoint or give up the centre."),
    t("c3 + h3 + d4: el centro clásico; el caballo de b1 va a d2-f1-g3.", "c3 + h3 + d4: the classical centre; the b1-knight goes d2-f1-g3."),
    t("En la Berlinesa se llega pronto a un final: entender ese final es más útil que memorizar.", "The Berlin reaches an early endgame: understanding it beats memorising."),
  ],
  structures: [t("Centro cerrado tras d4-d5 o centro tenso e4/d4 contra e5/d6.", "Closed centre after d4-d5, or tension e4/d4 vs e5/d6.")],
  plans: [t("Maniobra Cbd2-f1-g3 y ataque en el flanco de rey.", "Nbd2-f1-g3 and a kingside attack."), t("Si el centro se cierra: juego en el flanco de dama con a4 contra la cadena b5.", "If the centre closes: queenside play with a4 against the b5 chain.")],
  typicalMistakes: [t("Cambiar en c6 sin motivo: entrega la pareja de alfiles.", "Trading on c6 without reason: it gives up the bishop pair."), t("Olvidar que el Ab3 puede quedar atrapado tras ...c5-c4.", "Forgetting the b3-bishop can get trapped after ...c5-c4.")],
  tree: buildTree([
    { sans: sp("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3"), name: "Closed Ruy Lopez", ideas: { 4: t("Ab5 ataca al defensor de e5.", "Bb5 attacks the defender of e5."), 6: t("Aa4 mantiene la clavada potencial.", "Ba4 keeps the potential pin."), 14: t("c3 prepara d4 y crea la casilla c2 para el alfil.", "c3 prepares d4 and creates c2 for the bishop."), 16: t("h3 evita ...Ag4 antes de d4.", "h3 stops ...Bg4 before d4.") } },
    { sans: sp("e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8"), name: "Berlin endgame", ideas: { 15: t("Final berlinés: tienes mayoría de peones sana en el flanco de rey; las negras, la pareja de alfiles.", "Berlin endgame: you have a healthy kingside majority; Black has the bishop pair.") } },
    { sans: sp("e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4"), name: "Exchange variation", ideas: { 6: t("Variante del cambio: tu mayoría 4 contra 3 en el flanco de rey vale en el final.", "Exchange variation: your 4-vs-3 kingside majority matters in the endgame.") } },
  ]),
};

export const ENGLISH: Repertoire = {
  id: "english", side: "w", group: "white", theoryLoad: 1, structureIds: ["reversed-sicilian"],
  name: t("Inglesa (1.c4)", "English Opening (1.c4)"),
  style: t("Flexible: una Siciliana invertida con un tiempo de más; mucho juego de maniobras.", "Flexible: a reversed Sicilian with an extra tempo; lots of manoeuvring."),
  summary: t("1.c4 controla d5 desde el flanco. Con g3 y Ag2 el alfil presiona la gran diagonal. Encaja bien con jugadores que prefieren entender esquemas a memorizar.",
    "1.c4 controls d5 from the wing. With g3 and Bg2 the bishop pressures the long diagonal. It suits players who prefer understanding setups to memorising."),
  principles: [t("Fianchetto de rey: el Ag2 es tu mejor pieza; no lo cambies a la ligera.", "King's fianchetto: the g2-bishop is your best piece; don't trade it lightly."), t("Juego en el flanco de dama: Tb1, b4-b5 contra el caballo de c6.", "Queenside play: Rb1, b4-b5 against the c6-knight.")],
  structures: [t("Siciliana invertida (tu peón c contra e5 negro).", "Reversed Sicilian (your c-pawn against Black's e5).")],
  plans: [t("Expansión b4-b5 y control de d5.", "b4-b5 expansion and control of d5."), t("Ruptura central d4 o f4 cuando estés más desarrollado.", "Central break d4 or f4 once better developed.")],
  typicalMistakes: [t("Jugar demasiado pasivo y dejar que las negras ocupen el centro con ...d5 y ...e5 sin presión.", "Being too passive and letting Black occupy the centre with ...d5 and ...e5 unchallenged.")],
  tree: buildTree([
    { sans: sp("c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3"), name: "Four Knights, reversed Sicilian", ideas: { 6: t("g3/Ag2: presión sobre d5 y la gran diagonal.", "g3/Bg2: pressure on d5 and the long diagonal."), 14: t("d3 y luego Ae3, Tc1 o a4-a5 contra el caballo de b6.", "d3 then Be3, Rc1 or a4-a5 against the b6-knight.") } },
    { sans: sp("c4 Nf6 Nc3 e6 e4 d5 e5 d4"), name: "Mikenas idea", ideas: { 4: t("e4: ganas espacio en el centro si las negras lo permiten.", "e4: grab central space if Black allows it.") } },
    { sans: sp("c4 c5 Nf3 Nc6 g3 g6 Bg2 Bg7 O-O e5 Nc3"), name: "Symmetrical", ideas: { 9: t("Contra la simétrica, b4 o a3+b4 es la ruptura típica.", "Against the Symmetrical, b4 (or a3+b4) is the typical break.") } },
  ]),
};

export const SICILIAN_NAJDORF: Repertoire = {
  id: "sicilian-najdorf", side: "b", group: "black_e4", theoryLoad: 3, structureIds: ["najdorf"],
  name: t("Siciliana Najdorf (1.e4 c5 … 5…a6)", "Sicilian Najdorf (1.e4 c5 … 5...a6)"),
  style: t("Combativa y desequilibrada: juegas para ganar con negras. Exige cálculo.", "Combative and unbalanced: you play to win with Black. Demands calculation."),
  summary: t("Cambias tu peón c por el peón d blanco: tienes mayoría central (d6/e6 o e5) y la columna c. ...a6 es una jugada útil que evita Cb5/Ab5 y prepara ...b5 o ...e5.",
    "You trade your c-pawn for White's d-pawn: you get a central majority (d6/e6 or e5) and the c-file. ...a6 is a useful move that stops Nb5/Bb5 and prepares ...b5 or ...e5."),
  principles: [
    t("La ruptura liberadora es ...d5: si la consigues con seguridad, sueles igualar o mejor.", "The freeing break is ...d5: if you achieve it safely you usually equalise or better."),
    t("Con ...e5 cedes la casilla d5: controla d5 (…Ae6, …Cbd7-b6) para que no sea un puesto blanco.", "With ...e5 you concede d5: control it (...Be6, ...Nbd7-b6) so it doesn't become a white outpost."),
    t("Cuando las blancas enrocan largo, carrera de ataques: ...b5-b4 es tu motor.", "When White castles long it's a race: ...b5-b4 is your engine."),
  ],
  structures: [t("Najdorf con ...e5 (casilla d5 débil, peón d6 retrasado) o con ...e6 (estructura Scheveningen).", "Najdorf with ...e5 (weak d5, backward d6) or with ...e6 (Scheveningen structure).")],
  plans: [t("Contrajuego por la columna c y ...b5-b4.", "Counterplay on the c-file and ...b5-b4."), t("Ruptura ...d5 en el momento justo.", "The ...d5 break at the right moment.")],
  typicalMistakes: [t("Retrasar el desarrollo del flanco de rey y recibir un ataque directo.", "Delaying kingside development and getting mated."), t("Jugar ...e5 sin controlar d5.", "Playing ...e5 without controlling d5.")],
  tree: buildTree([
    { sans: sp("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O"), name: "English Attack", ideas: { 9: t("...a6: la jugada Najdorf; evita Cb5 y prepara ...e5 o ...b5.", "...a6: the Najdorf move; stops Nb5 and prepares ...e5 or ...b5."), 11: t("...e5 gana espacio y expulsa el caballo, a costa de d5.", "...e5 gains space and kicks the knight, at the cost of d5."), 13: t("...Ae6 controla d5.", "...Be6 controls d5."), 17: t("Con enroques opuestos, ...b5 y ...Cbd7-b6 son tu ataque.", "With opposite castling, ...b5 and ...Nbd7-b6 are your attack.") } },
    { sans: sp("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7"), name: "6.Bg5", ideas: { 11: t("...e6 refuerza d5 y abre la diagonal del alfil de f8.", "...e6 reinforces d5 and opens the f8-bishop.") } },
    { sans: sp("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O"), name: "6.Be2 (Classical)", ideas: { 11: t("Contra un esquema tranquilo, ...e5 y desarrollo armónico.", "Against a quiet setup, ...e5 and harmonious development.") } },
    { sans: sp("e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6"), name: "vs Alapin (2.c3)", ideas: { 3: t("...Cf6 ataca e4 antes de que d4 lo apoye.", "...Nf6 hits e4 before d4 can support it."), 11: t("...d6 ataca el peón avanzado de e5.", "...d6 attacks the advanced e5-pawn.") } },
    { sans: sp("e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7"), name: "vs 3.Bb5+ (Moscow)", ideas: { 5: t("Cambia alfiles: tu estructura es sólida y la partida, de maniobras.", "Trade bishops: your structure is solid and the game is about manoeuvres.") } },
  ]),
};

export const FRENCH: Repertoire = {
  id: "french", side: "b", group: "black_e4", theoryLoad: 2, structureIds: ["french-chain"],
  name: t("Defensa Francesa (1.e4 e6)", "French Defence (1.e4 e6)"),
  style: t("Contraataque estratégico: cedes espacio y luego atacas la cadena de peones.", "Strategic counter-attack: concede space, then attack the pawn chain."),
  summary: t("...d5 discute e4. Si las blancas avanzan e5, se forma una cadena (d4-e5 contra e6-d5) y tu plan es atacar su base con ...c5 y su cabeza con ...f6.",
    "...d5 challenges e4. If White pushes e5, a chain forms (d4-e5 vs e6-d5) and your plan is to attack its base with ...c5 and its head with ...f6."),
  principles: [
    t("Ataca la cadena por la base (...c5) primero, después por la cabeza (...f6).", "Attack the chain at the base (...c5) first, then at the head (...f6)."),
    t("Tu alfil de casillas blancas es el 'malo': busca cambiarlo (…b6/…Aa6) o activarlo tras ...f6.", "Your light-squared bishop is the 'bad' one: trade it (...b6/...Ba6) or activate it after ...f6."),
    t("Presiona d4 con ...Cc6, ...Db6 y ...Cge7-f5.", "Pressure d4 with ...Nc6, ...Qb6 and ...Nge7-f5."),
  ],
  structures: [t("Cadena francesa (Avanzada, Winawer, Steinitz).", "French chain (Advance, Winawer, Steinitz)."), t("Peón aislado tras la Tarrasch con ...c5 y ...exd5.", "IQP structures from the Tarrasch.")],
  plans: [t("...c5, ...Cc6, ...Db6 contra d4.", "...c5, ...Nc6, ...Qb6 against d4."), t("...f6 para abrir la columna f cuando el rey esté seguro.", "...f6 to open the f-file once your king is safe.")],
  typicalMistakes: [t("Quedarse pasivo sin ...c5: las blancas atacan en el flanco de rey con total libertad.", "Staying passive without ...c5: White attacks on the kingside freely."), t("Enrocar corto frente a un ataque preparado (Dg4, h4-h5).", "Castling short into a prepared attack (Qg4, h4-h5).")],
  tree: buildTree([
    { sans: sp("e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4"), name: "Advance Variation", ideas: { 4: t("Avanzada: la cadena está fijada; ataca su base.", "Advance: the chain is fixed; attack its base."), 5: t("...c5 ataca d4 de inmediato.", "...c5 hits d4 at once."), 9: t("...Db6 suma presión sobre d4 y b2.", "...Qb6 adds pressure on d4 and b2."), 11: t("...c4 gana espacio y bloquea el flanco de dama; luego ...Ad7-b5 o ...f6.", "...c4 gains queenside space; then ...Bd7-b5 or ...f6.") } },
    { sans: sp("e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5"), name: "Classical Steinitz", ideas: { 15: t("De nuevo ...c5: siempre la base de la cadena.", "Again ...c5: always the base of the chain.") } },
    { sans: sp("e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O"), name: "Winawer", ideas: { 5: t("...Ab4 clava el caballo que defiende e4.", "...Bb4 pins the knight defending e4."), 10: t("Doblas los peones blancos a cambio de tu alfil de casillas negras.", "You double White's pawns in exchange for your dark-squared bishop.") } },
    { sans: sp("e4 e6 d4 d5 Nd2 c5 exd5 Qxd5 Ngf3 cxd4 Bc4 Qd6"), name: "Tarrasch 3...c5", ideas: { 5: t("Contra Cd2, ...c5 abre el juego antes de que las blancas consoliden.", "Against Nd2, ...c5 opens the game before White consolidates.") } },
    { sans: sp("e4 e6 d4 d5 exd5 exd5 Bd3 Bd6"), name: "Exchange", ideas: { 5: t("Simétrica: desarrollo activo y casilla e4 para tu caballo.", "Symmetrical: active development and e4 for your knight.") } },
  ]),
};

export const OPEN_E5: Repertoire = {
  id: "open-e5", side: "b", group: "black_e4", theoryLoad: 2, structureIds: ["open-e5"],
  name: t("1…e5 (Juegos abiertos con negras)", "1...e5 (Open Games as Black)"),
  style: t("Clásica y equilibrada: ocupas el centro igual que las blancas.", "Classical and balanced: you take the centre just like White."),
  summary: t("La respuesta más natural: un peón central por otro. Es la mejor escuela de principios: desarrollo, centro y seguridad del rey.",
    "The most natural reply: a central pawn for a central pawn. The best school of principles: development, centre and king safety."),
  principles: [t("Defiende e5 con piezas (…Cc6, …d6), no lo cedas sin compensación.", "Defend e5 with pieces (...Nc6, ...d6); don't give it up for nothing."), t("Vigila f7 en los primeros movimientos.", "Watch f7 in the first moves."), t("En la Española, ...a6 y ...b5 hacen que el alfil decida.", "In the Ruy, ...a6 and ...b5 make the bishop decide.")],
  structures: [t("Centro simétrico e4/e5 con d3/d6 o centro abierto tras d4.", "Symmetrical e4/e5 with d3/d6, or an open centre after d4.")],
  plans: [t("Ruptura ...d5 cuando esté bien preparada.", "The ...d5 break when well prepared."), t("En la Española cerrada: ...Ca5 y ...c5 en el flanco de dama.", "In the closed Ruy: ...Na5 and ...c5 on the queenside.")],
  typicalMistakes: [t("Permitir Cg5 contra f7 sin preparación.", "Allowing Ng5 against f7 unprepared."), t("Jugar ...d5 prematuro y perder el peón e5.", "Premature ...d5 losing the e5-pawn.")],
  tree: buildTree([
    { sans: sp("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O a6"), name: "vs Italian", ideas: { 5: t("...Ac5 apunta a f2, simétrico al Ac4 blanco.", "...Bc5 eyes f2, mirroring White's Bc4."), 11: t("...a6 da al alfil la retirada a7 frente a d4/b4.", "...a6 gives the bishop the a7 retreat against d4/b4.") } },
    { sans: sp("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O"), name: "vs Ruy Lopez: Closed", ideas: { 5: t("...a6 pregunta al alfil.", "...a6 questions the bishop."), 11: t("...b5 gana espacio; el alfil va a b3.", "...b5 gains space; the bishop goes to b3.") } },
    { sans: sp("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6"), name: "vs Scotch", ideas: { 7: t("...Cf6 ataca e4 y acelera el desarrollo.", "...Nf6 hits e4 and speeds development."), 15: t("...Aa6 clava el peón c4 contra la dama.", "...Ba6 pins the c4-pawn to the queen.") } },
    { sans: sp("e4 e5 f4 exf4 Nf3 d5 exd5 Nf6"), name: "vs King's Gambit", ideas: { 5: t("Devuelve material con ...d5: desarrollo rápido en vez de aferrarte al peón.", "Return material with ...d5: rapid development instead of clinging to the pawn.") } },
    { sans: sp("e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4"), name: "vs Vienna", ideas: { 5: t("...d5: contragolpe central, la mejor respuesta a f4 en la Viena.", "...d5: central counterstrike, the best answer to f4 in the Vienna.") } },
  ]),
};

export const QGD_BLACK: Repertoire = {
  id: "qgd", side: "b", group: "black_d4", theoryLoad: 2, structureIds: ["carlsbad", "iqp", "hanging-pawns"],
  name: t("Gambito de Dama Declinado (negras)", "Queen's Gambit Declined (Black)"),
  style: t("Muy sólida: mantienes d5 con ...e6 y liberas con ...c5 o ...e5.", "Very solid: hold d5 with ...e6 and free yourself with ...c5 or ...e5."),
  summary: t("Defiendes d5 con un peón. El precio es encerrar tu alfil de c8; toda la defensa gira en torno a liberarlo (…b6/…Ab7, ...dxc4 + ...e5, o ...c5).",
    "You defend d5 with a pawn. The cost is shutting in your c8-bishop; the whole defence revolves around freeing it (...b6/...Bb7, ...dxc4 + ...e5, or ...c5)."),
  principles: [t("Liberar el alfil de c8 es tu problema estratégico número uno.", "Freeing the c8-bishop is your number one strategic problem."), t("Contra Ag5, ...h6 pregunta al alfil y gana un tiempo útil.", "Against Bg5, ...h6 questions the bishop and gains a useful tempo."), t("Las rupturas liberadoras son ...c5 y ...e5.", "The freeing breaks are ...c5 and ...e5.")],
  structures: [t("Carlsbad (tras cxd5 exd5): defiende contra el ataque de minorías.", "Carlsbad (after cxd5 exd5): defend against the minority attack."), t("Peones colgantes c5/d5 tras ...c5 y cambios.", "Hanging pawns c5/d5 after ...c5 and exchanges.")],
  plans: [t("En la Carlsbad: ...Ce4, ataque en el flanco de rey con ...f5 o ...Cf8-g6.", "In the Carlsbad: ...Ne4 and kingside play with ...f5 or ...Nf8-g6."), t("En la Tartakower: ...Ab7 y ...c5.", "In the Tartakower: ...Bb7 and ...c5.")],
  typicalMistakes: [t("Jugar ...dxc4 sin plan y quedarse sin centro.", "Playing ...dxc4 without a plan and losing the centre."), t("Dejar el alfil de c8 encerrado toda la partida.", "Leaving the c8-bishop buried all game.")],
  tree: buildTree([
    { sans: sp("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6"), name: "Tartakower", ideas: { 3: t("...e6 defiende d5 con un peón.", "...e6 defends d5 with a pawn."), 11: t("...h6 pregunta al alfil.", "...h6 questions the bishop."), 13: t("...b6 y ...Ab7: el alfil de c8 sale por la diagonal larga.", "...b6 and ...Bb7: the c8-bishop comes out on the long diagonal.") } },
    { sans: sp("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7"), name: "Exchange (Carlsbad)", ideas: { 7: t("Estructura Carlsbad: tu alfil de c8 ya está libre.", "Carlsbad structure: your c8-bishop is now free."), 9: t("...c6 refuerza d5 y prepara ...Cbd7-f8.", "...c6 reinforces d5 and prepares ...Nbd7-f8.") } },
    { sans: sp("d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4"), name: "vs Catalan", ideas: { 11: t("...dxc4: tomar el peón y devolverlo a cambio de desarrollo (…a6, …b5 o …c5).", "...dxc4: take the pawn and return it for development (...a6, ...b5 or ...c5).") } },
    { sans: sp("d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6"), name: "vs London", ideas: { 5: t("Contra el Londres, ...c5 inmediato ataca d4 y b2.", "Against the London, an immediate ...c5 hits d4 and b2.") } },
  ]),
};

export const SLAV: Repertoire = {
  id: "slav", side: "b", group: "black_d4", theoryLoad: 2, structureIds: ["slav-structure", "carlsbad"],
  name: t("Defensa Eslava (1.d4 d5 2.c4 c6)", "Slav Defence (1.d4 d5 2.c4 c6)"),
  style: t("Sólida como la Caro-Kann: defiendes d5 sin encerrar tu alfil de c8.", "Solid like the Caro-Kann: you defend d5 without shutting in your c8-bishop."),
  summary: t("...c6 defiende d5 dejando libre la diagonal del alfil de c8, que saldrá a f5 o g4 antes de ...e6. Es la 'Caro-Kann contra 1.d4': te resultará familiar.",
    "...c6 defends d5 while keeping the c8-bishop's diagonal open; it comes out to f5 or g4 before ...e6. It's the 'Caro-Kann against 1.d4': it will feel familiar."),
  principles: [t("Saca el alfil de c8 antes de ...e6.", "Develop the c8-bishop before ...e6."), t("Si tomas en c4, las blancas lo recuperan: úsalo para ganar tiempos (…Af5, …e6, …Ab4).", "If you take on c4 White regains it: use that time (...Bf5, ...e6, ...Bb4)."), t("Rupturas: ...c5 o ...e5.", "Breaks: ...c5 or ...e5.")],
  structures: [t("Estructura eslava: triángulo c6-d5-e6 con el alfil fuera.", "Slav structure: c6-d5-e6 triangle with the bishop outside."), t("Eslava del cambio: estructura simétrica, lucha por la columna c.", "Exchange Slav: symmetrical, a fight over the c-file.")],
  plans: [t("…Ab4, …0-0, …Cbd7 y ruptura ...e5 o ...c5.", "...Bb4, ...O-O, ...Nbd7 and the ...e5 or ...c5 break.")],
  typicalMistakes: [t("Intentar retener el peón de c4 con ...b5 cuando las blancas ya jugaron a4.", "Trying to hold c4 with ...b5 after White has played a4."), t("Dejar el alfil de f5 expuesto a Ch4 o Db3.", "Leaving the f5-bishop exposed to Nh4 or Qb3.")],
  tree: buildTree([
    { sans: sp("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O"), name: "Main line", ideas: { 3: t("...c6 defiende d5 sin encerrar el alfil.", "...c6 defends d5 without blocking the bishop."), 9: t("...Af5: el alfil sale antes de ...e6.", "...Bf5: the bishop comes out before ...e6."), 13: t("...Ab4 clava el caballo y frena e4.", "...Bb4 pins the knight and restrains e4.") } },
    { sans: sp("d4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 Bf5"), name: "Exchange Slav", ideas: { 11: t("Simetría: desarrollo activo y lucha por la columna c.", "Symmetry: active development and a fight for the c-file.") } },
    { sans: sp("d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Nc3 e6 Nh4 Bg6"), name: "3.e3 / Nh4", ideas: { 11: t("...Ag6: si Cxg6, recapturas con h y la columna h se abre para tu torre.", "...Bg6: if Nxg6 you recapture with the h-pawn and the h-file opens for your rook.") } },
  ]),
};

export const KINGS_INDIAN: Repertoire = {
  id: "kings-indian", side: "b", group: "black_d4", theoryLoad: 3, structureIds: ["kid-closed"],
  name: t("India de Rey (…Cf6, …g6, …Ag7, …d6)", "King's Indian Defence (...Nf6, ...g6, ...Bg7, ...d6)"),
  style: t("Hipermoderna y agresiva: cedes el centro y lo atacas después con ...e5 o ...c5.", "Hypermodern and aggressive: concede the centre, then strike with ...e5 or ...c5."),
  summary: t("Dejas que las blancas construyan un gran centro y lo atacas con ...e5. Si cierran con d5, la partida es una carrera: ellas atacan en el flanco de dama, tú en el de rey con ...f5.",
    "You let White build a big centre and hit it with ...e5. If White closes with d5 it becomes a race: White attacks on the queenside, you on the kingside with ...f5."),
  principles: [t("Enroca pronto: el Ag7 protege a tu rey y presiona d4.", "Castle early: the g7-bishop guards your king and pressures d4."), t("Con el centro cerrado, cada tiempo cuenta: ...Ce8/...Cd7, ...f5, ...f4, ...g5.", "With a closed centre every tempo counts: ...Ne8/...Nd7, ...f5, ...f4, ...g5."), t("No dejes que las blancas abran la columna c antes de que tu ataque llegue.", "Don't let White open the c-file before your attack arrives.")],
  structures: [t("Centro cerrado d5/e4 contra d6/e5 (cadenas opuestas).", "Closed centre d5/e4 vs d6/e5 (opposing chains).")],
  plans: [t("Ataque en el flanco de rey: ...f5, ...f4, ...g5-g4.", "Kingside attack: ...f5, ...f4, ...g5-g4."), t("Si las blancas no cierran: ...exd4 y presión sobre e4 con ...Te8 y ...Cc6.", "If White doesn't close: ...exd4 and pressure e4 with ...Re8 and ...Nc6.")],
  typicalMistakes: [t("Jugar pasivo con el centro cerrado: perder la carrera de ataques.", "Playing passively with a closed centre: losing the race."), t("Cambiar el Ag7 sin necesidad.", "Trading the g7-bishop needlessly.")],
  tree: buildTree([
    { sans: sp("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7"), name: "Classical (Mar del Plata)", ideas: { 3: t("...g6 y ...Ag7: el alfil presionará d4 desde lejos.", "...g6 and ...Bg7: the bishop will pressure d4 from afar."), 11: t("...e5: la ruptura central clave.", "...e5: the key central strike."), 15: t("...Ce7: el caballo va hacia el flanco de rey (g6 o f5).", "...Ne7: the knight heads to the kingside (g6 or f5)."), 17: t("...Cd7 prepara ...f5: comienza tu ataque.", "...Nd7 prepares ...f5: your attack begins.") } },
    { sans: sp("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5"), name: "vs Sämisch", ideas: { 13: t("...Ch5 prepara ...f5 aprovechando que f3 debilitó g3.", "...Nh5 prepares ...f5, using the g3 weakness created by f3.") } },
    { sans: sp("d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O Nbd7"), name: "vs Fianchetto", ideas: { 11: t("...Cbd7 y ...e5: misma idea, sin abrir el alfil blanco de g2.", "...Nbd7 and ...e5: same idea, without opening White's g2-bishop.") } },
    { sans: sp("d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3"), name: "vs London", ideas: { 9: t("Contra el Londres: ...d6, ...Cbd7 y ...e5, o ...c5.", "Against the London: ...d6, ...Nbd7 and ...e5, or ...c5.") } },
  ]),
};

export const NIMZO_INDIAN: Repertoire = {
  id: "nimzo-indian", side: "b", group: "black_d4", theoryLoad: 2, structureIds: ["nimzo-doubled-c", "iqp"],
  name: t("Nimzoindia (…Cf6, …e6, …Ab4)", "Nimzo-Indian (...Nf6, ...e6, ...Bb4)"),
  style: t("Estratégica y flexible: lucha por e4 con piezas y estructuras desequilibradas.", "Strategic and flexible: fight for e4 with pieces and unbalanced structures."),
  summary: t("...Ab4 clava el caballo que controla e4. A menudo cambias el alfil por el caballo para doblar los peones blancos: tus caballos contra su pareja de alfiles.",
    "...Bb4 pins the knight that controls e4. You often trade bishop for knight to double White's pawns: your knights versus their bishop pair."),
  principles: [t("Controla e4 (…Ab4, …b6/…Ab7, …Ce4).", "Control e4 (...Bb4, ...b6/...Bb7, ...Ne4)."), t("Si doblas los peones c, bloquea la posición: los caballos odian las posiciones abiertas.", "If you double the c-pawns, keep the position closed: knights dislike open positions."), t("Ataca los peones doblados con ...c5, ...Ca5 y ...Aa6.", "Attack the doubled pawns with ...c5, ...Na5 and ...Ba6.")],
  structures: [t("Peones c doblados (c3/c4) del blanco.", "White's doubled c-pawns (c3/c4)."), t("Peón aislado tras ...d5/...c5 en la Rubinstein.", "IQP after ...d5/...c5 in the Rubinstein.")],
  plans: [t("Bloqueo y presión sobre c4.", "Blockade and pressure on c4."), t("Ruptura ...e5 o ...c5 para abrir líneas contra el centro.", "...e5 or ...c5 to open lines against the centre.")],
  typicalMistakes: [t("Abrir el juego cuando las blancas tienen la pareja de alfiles.", "Opening the game while White has the bishop pair."), t("Cambiar en c3 sin necesidad cuando las blancas pueden recapturar con la dama.", "Trading on c3 needlessly when White can recapture with the queen.")],
  tree: buildTree([
    { sans: sp("d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O"), name: "Rubinstein (4.e3)", ideas: { 5: t("...Ab4 clava el caballo y lucha por e4.", "...Bb4 pins the knight and fights for e4."), 11: t("...c5 golpea el centro; atento a las estructuras de peón aislado.", "...c5 strikes the centre; watch for IQP structures.") } },
    { sans: sp("d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6"), name: "Classical (4.Qc2)", ideas: { 10: t("Las blancas tienen la pareja de alfiles; tú, desarrollo rápido y control de e4.", "White has the bishop pair; you have quick development and control of e4."), 11: t("...b6 y ...Ab7: más control sobre e4.", "...b6 and ...Bb7: more control over e4.") } },
    { sans: sp("d4 Nf6 c4 e6 Nf3 b6 g3 Ba6"), name: "vs 3.Nf3: Queen's Indian", ideas: { 7: t("...Aa6 ataca c4: obliga a las blancas a defenderlo con piezas menos activas.", "...Ba6 hits c4: White must defend it with less active pieces.") } },
    { sans: sp("d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4"), name: "vs 3.g3: Catalan", ideas: { 11: t("...dxc4 y devolver el peón a cambio de desarrollo.", "...dxc4 and return the pawn for development.") } },
  ]),
};

export const REPERTOIRES: Repertoire[] = [LONDON, QUEENS_GAMBIT, ITALIAN, RUY_LOPEZ, ENGLISH, CARO_KANN, SICILIAN_NAJDORF, FRENCH, OPEN_E5, QGD_BLACK, SLAV, KINGS_INDIAN, NIMZO_INDIAN];
export const repertoireById = (id: string) => REPERTOIRES.find((r) => r.id === id);
export const DEFAULT_REPERTOIRE_IDS = ["london", "caro-kann"];

/** Pick the user's repertoire module that best matches a game (longest matched prefix).
 *  Searches the user's selected modules for that colour first, then every module of that colour. */
export function bestRepertoireMatch(sans: string[], userColor: "w" | "b", selectedIds: string[] = DEFAULT_REPERTOIRE_IDS): { rep: Repertoire; match: RepertoireMatch; inUserRepertoire: boolean } {
  const pick = (reps: Repertoire[]) => reps
    .map((rep) => ({ rep, match: matchRepertoire(rep, sans, userColor) }))
    .sort((a, b) => b.match.matchedPlies - a.match.matchedPlies)[0];
  const mine = REPERTOIRES.filter((r) => r.side === userColor && selectedIds.includes(r.id));
  const best = mine.length ? pick(mine) : undefined;
  if (best && best.match.matchedPlies >= 4) return { ...best, inUserRepertoire: true };
  const any = pick(REPERTOIRES.filter((r) => r.side === userColor))!;
  if (best && best.match.matchedPlies >= any.match.matchedPlies) return { ...best, inUserRepertoire: true };
  return { ...any, inUserRepertoire: false };
}
