// Responde dudas sobre una micro acción concreta de un trabajo (chat), usando las fuentes del trabajo.
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const MODELO = process.env.AI_MODEL || "claude-haiku-4-5";
const MAX_FUENTES = 20000;
const MAX_HISTORIAL = 12;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textoFuentes(fuentes) {
  if (!Array.isArray(fuentes) || !fuentes.length) return "";
  const porFuente = Math.floor(MAX_FUENTES / fuentes.length);
  return fuentes
    .map((f, i) => `--- FUENTE ${i + 1}: ${f.nombre || "sin nombre"} ---\n${String(f.texto || "").slice(0, porFuente)}`)
    .join("\n\n");
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo de la petición no válido" }, 400);
  }

  const { trabajo, paso, fuentes, historial, pregunta } = body || {};
  if (!paso || !pregunta) return json({ error: "Falta la pregunta o el paso" }, 400);

  const fuentesTxt = textoFuentes(fuentes);

  const sistema = `Eres un tutor universitario paciente que ayuda a un estudiante a completar UNA micro acción de su trabajo.
Trabajo: ${trabajo?.titulo || ""} (${trabajo?.asignatura || ""})
Qué hay que entregar: ${trabajo?.resumen || ""}
Micro acción actual: ${paso.accion}
Detalle: ${paso.detalle || ""}
${fuentesTxt ? `\nFuentes que ha aportado el estudiante (úsalas y cita cuál cuando sea útil):\n${fuentesTxt}` : "El estudiante no ha aportado fuentes."}

Reglas:
- Responde en español, claro y práctico, centrado en esta micro acción.
- Si pide pasos más detallados, divide la acción en 3-7 sub-pasos numerados de 2-5 minutos cada uno.
- No hagas el trabajo por él: guía, da ejemplos cortos y ayúdale a empezar.
- Texto plano, sin markdown (nada de ** ni #). Usa listas numeradas simples si hace falta.
- Sé breve: máximo unas 200 palabras salvo que pida más.`;

  const mensajes = (Array.isArray(historial) ? historial : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORIAL)
    .map((m) => ({ role: m.role, content: String(m.content) }));
  while (mensajes.length && mensajes[0].role !== "user") mensajes.shift();
  mensajes.push({ role: "user", content: String(pregunta) });

  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1200,
      system: sistema,
      messages: mensajes,
    });
    const texto = respuesta.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return json({ respuesta: texto });
  } catch (err) {
    console.error(err);
    return json({ error: "No se pudo responder: " + err.message }, 500);
  }
};

export const config = { path: "/api/duda" };
