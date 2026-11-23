import type { WithdrawalPhase } from "../core/domain/withdrawal";
import type { InterventionId } from "../core/engine/interventions";

export interface Step {
  text: string;
  /** Segundos que dura el paso; 0 = espera a que la persona toque "Listo". */
  seconds: number;
}

export const es = {
  appName: "Maljut",

  withdrawal: {
    start: {
      title: "Primeras 48 horas",
      expect: "Puede que todavía no sientas mucho, o que el antojo aparezca fuerte a las horas de siempre. Algo de inquietud y ganas de \"premio\" al final del día son normales.",
      tip: "Hoy importa tener un plan para tus horas de siempre: temprano, antes y después del trabajo, antes de dormir.",
    },
    peak: {
      title: "El pico (días 2 a 6)",
      expect: "Es la parte más dura: irritabilidad, ansiedad, poco apetito, sudoración, insomnio y sueños muy vívidos. No es que estés peor; es tu cerebro reajustándose.",
      tip: "Come algo aunque no tengas hambre, muévete un poco y baja la exigencia contigo. Esto tiene fecha de caducidad.",
    },
    easing: {
      title: "Bajando (semana 2)",
      expect: "La mayoría de los síntomas empiezan a aflojar. El antojo llega en olas más cortas, pero puede aparecer con fuerza en tus situaciones de siempre.",
      tip: "Ahora el riesgo no es el cuerpo, son los hábitos: amigos, música, eventos. Ten tu plan \"si pasa X, hago Y\" a mano.",
    },
    settling: {
      title: "Acomodándote (semanas 3 y 4)",
      expect: "El ánimo y la energía se estabilizan. El sueño puede seguir raro: sueños intensos o despertares.",
      tip: "Buen momento para llenar los huecos de tiempo que antes ocupaba fumar con algo que te guste de verdad.",
    },
    sleep_tail: {
      title: "La cola del sueño (mes 2)",
      expect: "Casi todo lo físico pasó. El sueño puede tardar algo más en normalizarse; es frecuente y mejora.",
      tip: "Rutina de sueño constante: misma hora de acostarte, pantallas fuera 30 minutos antes.",
    },
    beyond: {
      title: "Nueva normalidad",
      expect: "Lo físico quedó atrás. El antojo, cuando aparece, suele estar atado a situaciones concretas.",
      tip: "Sigue registrando los antojos: cada uno te dice algo de tus disparadores.",
    },
  } satisfies Record<WithdrawalPhase, { title: string; expect: string; tip: string }>,

  interventions: {
    sigh: {
      title: "Suspiro fisiológico",
      subtitle: "Dos inhalaciones, una exhalación larga. Baja el acelere en un par de minutos.",
      intro: "Inhala por la nariz, luego una segunda inhalación corta para llenar del todo. Suelta despacio por la boca.",
    },
    box: {
      title: "Respiración en caja",
      subtitle: "4 tiempos para inhalar, sostener, exhalar y sostener.",
      intro: "Sigue el cuadrado. Si 4 tiempos se te hacen largos, está bien quedarte corto.",
    },
    urge_surf: {
      title: "Surfear el antojo",
      subtitle: "Observar la ola en vez de pelear con ella. 6 minutos.",
      intro: "Un antojo es como una ola: sube, llega a un punto alto y baja. No tienes que hacer nada con él, solo mirarlo.",
    },
    reasons: {
      title: "Tus porqués",
      subtitle: "Recordar por qué empezaste esto.",
      intro: "Esto lo escribiste tú, en frío, para este momento.",
    },
    grounding: {
      title: "Anclaje 5-4-3-2-1",
      subtitle: "Volver al presente con los sentidos.",
      intro: "Vamos a sacar la atención de la cabeza y llevarla a lo que te rodea.",
    },
  } satisfies Record<InterventionId, { title: string; subtitle: string; intro: string }>,

  urgeSurfSteps: [
    { text: "Ponte cómodo. Si puedes, apoya los pies en el suelo. Respira normal, sin forzar nada.", seconds: 20 },
    { text: "Nota que tienes ganas de fumar. No las juzgues. Solo dilo por dentro: \"aquí está el antojo\".", seconds: 25 },
    { text: "¿Dónde lo sientes en el cuerpo? Quizá en el pecho, en la garganta, en las manos, en el estómago. Busca el lugar.", seconds: 35 },
    { text: "Describe la sensación como si fueras un científico curioso: ¿es tensión, calor, cosquilleo, vacío? ¿Es grande o pequeña?", seconds: 40 },
    { text: "Ahora respira hacia ese lugar. Al inhalar, imagina que le haces espacio. Al exhalar, la dejas estar.", seconds: 40 },
    { text: "Fíjate si la sensación cambia. Puede crecer un poco, moverse o bajar. Las olas suben y bajan. No tienes que hacer nada.", seconds: 45 },
    { text: "Si aparece un pensamiento como \"solo uno\" o \"me lo merezco\", obsérvalo como una nube que pasa. Es un pensamiento, no una orden.", seconds: 40 },
    { text: "Vuelve a la sensación del cuerpo. ¿Qué tan fuerte está ahora, del 1 al 10? Solo nótalo.", seconds: 35 },
    { text: "Sigue respirando con la ola. Cada vez que la surfeas sin consumir, tu cerebro aprende que el antojo pasa solo.", seconds: 40 },
    { text: "Para cerrar, una respiración profunda. Abre los ojos si los tenías cerrados. Lo hiciste.", seconds: 15 },
  ] satisfies Step[],

  groundingSteps: [
    { text: "Nombra 5 cosas que puedas ver. Dilas en voz baja, con detalle: colores, formas.", seconds: 0 },
    { text: "4 cosas que puedas tocar. Tócalas de verdad: la tela, la mesa, tu piel.", seconds: 0 },
    { text: "3 cosas que puedas oír. Las cercanas y las lejanas.", seconds: 0 },
    { text: "2 cosas que puedas oler. Si no hay olor, recuerda uno que te guste.", seconds: 0 },
    { text: "1 cosa que puedas saborear. Un trago de agua sirve.", seconds: 0 },
    { text: "Listo. Fíjate cómo está ahora el antojo. Probablemente no desapareció, pero ya no ocupa todo.", seconds: 0 },
  ] satisfies Step[],

  breath: { inhale: "Inhala", inhale2: "Un poco más", hold: "Sostén", exhale: "Exhala" },

  crisis: {
    howStrong: "¿Qué tan fuerte es?",
    whatFeel: "¿Qué sientes?",
    where: "¿Dónde estás o qué pasa?",
    optional: "Opcional",
    skip: "Saltar",
    start: "Empezar",
    proposal: "Te propongo",
    another: "Prefiero otra",
    finish: "Terminar",
    howNow: "¿Y ahora, qué tan fuerte es?",
    helped: "¿Te sirvió?",
    yes: "Sí",
    some: "Algo",
    no: "No",
    usedQ: "¿Terminaste consumiendo?",
    usedNo: "No consumí",
    usedYes: "Sí, consumí",
    save: "Guardar",
    passes: "Los antojos suelen durar entre 15 y 30 minutos. Este también va a pasar.",
    doneGood: "Bien hecho. Un antojo surfeado más: cada uno hace más débil al siguiente.",
    doneUsed: "Gracias por registrarlo. Es un dato, no un fracaso. Si quieres, anota qué pasó para que la próxima vez tengas un plan.",
    logLapse: "Anotar qué pasó",
    back: "Volver al inicio",
  },

  emotions: ["Estrés", "Ansiedad", "Aburrimiento", "Irritación", "Tristeza", "Cansancio", "Soledad", "Ganas de celebrar"],
  contexts: ["En casa", "Trabajo", "Con amigos", "Música", "Evento o fiesta", "Al despertar", "Después del trabajo", "Antes de dormir"],

  checkin: {
    title: "Check-in de hoy",
    sub: "30 segundos. Del 1 al 5.",
    fields: {
      mood: ["Ánimo", "Muy bajo", "Muy bien"],
      sleep: ["Sueño anoche", "Fatal", "Genial"],
      anxiety: ["Ansiedad", "Nada", "Mucha"],
      irritability: ["Irritabilidad", "Nada", "Mucha"],
      appetite: ["Apetito", "Nada", "Normal"],
      cravings: ["Antojos", "Ninguno", "Muy fuertes"],
    },
    used: "¿Consumiste hoy?",
    note: "Una nota (opcional)",
    save: "Guardar check-in",
    done: "Check-in hecho",
  },

  lapse: {
    title: "Registrar un consumo",
    sub: "Sin juicio. Lo que pasó es información para la próxima vez.",
    when: "¿Cuándo fue?",
    amount: "¿Cuánto? (opcional)",
    before: "¿Qué pasó antes? ¿Dónde estabas, con quién, cómo te sentías?",
    during: "¿Qué pensaste justo en el momento de decidir?",
    after: "¿Cómo te sentiste después?",
    triggers: "Disparadores",
    ifThen: "Para la próxima: si pasa ___, entonces haré ___",
    ifThenPh: "Si llego a casa estresado, entonces salgo a caminar 10 minutos antes de sentarme",
    save: "Guardar",
    saved: "Guardado. Tu contador de este intento empieza de nuevo, pero tus días limpios totales y tu progreso siguen ahí.",
  },

  help: {
    title: "Si necesitas a una persona",
    lines: [
      { name: "988 Línea de Prevención del Suicidio y Crisis", detail: "Llama o envía un texto al 988. 24/7, en español.", tel: "988" },
      { name: "SAMHSA Línea Nacional de Ayuda", detail: "1-800-662-4357. Gratis, confidencial, 24/7, en español. Orientación sobre tratamiento.", tel: "18006624357" },
    ],
    note: "Maljut no sustituye a un profesional. Si sientes que puedes hacerte daño, llama al 988 ahora.",
  },
};

export type Content = typeof es;
export const t = es;
