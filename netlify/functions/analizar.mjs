// Función de Netlify que analiza un trabajo universitario con la IA de Netlify (AI Gateway).
// No necesitas API key: Netlify inyecta ANTHROPIC_API_KEY y ANTHROPIC_BASE_URL automáticamente.
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const MODELO = process.env.AI_MODEL || "claude-sonnet-4-6";
const MAX_CARACTERES = 60000;

const PROMPT_SISTEMA = `Eres un asistente académico experto en planificación y en dividir trabajos grandes en micro acciones.
Recibirás el enunciado o contenido de un trabajo universitario y su fecha de entrega.
Responde SOLO con un objeto JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
  "titulo": "título corto y claro del trabajo",
  "asignatura": "asignatura deducida o 'Sin especificar'",
  "resumen": "qué hay que entregar, en 1-2 frases",
  "horasEstimadas": número (horas reales de trabajo para un estudiante medio),
  "dificultad": número entero 1-5 (carga mental: 1 = mecánico, 5 = muy exigente, creativo o técnico),
  "justificacion": "por qué esas horas y esa dificultad, en 1-2 frases",
  "fases": [
    {
      "nombre": "nombre de la fase",
      "pasos": [
        { "accion": "micro acción concreta que empieza por un verbo", "detalle": "cómo hacerla exactamente", "minutos": número entre 5 y 25 }
      ]
    }
  ]
}
Reglas para las micro acciones:
- Cada paso debe poder empezarse sin pensar: concreto, pequeño y con un resultado visible (p. ej. "Abre un documento nuevo y escribe el título", no "Investiga el tema").
- Entre 12 y 35 pasos en total, repartidos en 3-6 fases ordenadas.
- El primer paso debe ser ridículamente fácil (menos de 5 minutos) para vencer la procrastinación.
- Incluye un paso final de revisión y otro de entrega.
- Escribe todo en español.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extraerJSON(texto) {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio === -1 || fin === -1) throw new Error("La IA no devolvió JSON");
  return JSON.parse(texto.slice(inicio, fin + 1));
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo de la petición no válido" }, 400);
  }

  const { contenido, fechaEntrega, nombreArchivo, notas } = body || {};
  if (!contenido || !fechaEntrega) {
    return json({ error: "Faltan el contenido del trabajo o la fecha de entrega" }, 400);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const texto = String(contenido).slice(0, MAX_CARACTERES);

  const mensaje = `Fecha de hoy: ${hoy}
Fecha de entrega: ${fechaEntrega}
Archivo: ${nombreArchivo || "sin nombre"}
${notas ? `Notas del estudiante: ${notas}\n` : ""}
--- CONTENIDO DEL TRABAJO ---
${texto}`;

  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 4000,
      system: PROMPT_SISTEMA,
      messages: [{ role: "user", content: mensaje }],
    });

    const salida = respuesta.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const analisis = extraerJSON(salida);

    analisis.horasEstimadas = Math.max(0.5, Number(analisis.horasEstimadas) || 2);
    analisis.dificultad = Math.min(5, Math.max(1, Math.round(Number(analisis.dificultad) || 3)));
    analisis.fases = Array.isArray(analisis.fases) ? analisis.fases : [];

    return json(analisis);
  } catch (err) {
    console.error(err);
    return json({ error: "No se pudo analizar el trabajo: " + err.message }, 500);
  }
};

export const config = { path: "/api/analizar" };
