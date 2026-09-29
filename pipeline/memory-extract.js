/**
 * pipeline/memory-extract.js
 * Extracción determinista de hechos durables (v1 sin embeddings).
 *
 * Dos niveles, como el resto del pipeline:
 *  1. Reglas locales $0: marcadores durables requeridos + blocklist de banter.
 *  2. Rescate opcional con System One (classifyTaskActionability) solo para
 *     candidatos con marcadores débiles; con timeout y fail-open.
 *
 * El shape de hechos vía LLM (`agy`) queda como seam `shapeFactsWithLLM`
 * para v2; hoy el shaping es por reglas para que los tests sean deterministas.
 */

const MEMORY_MARKERS = [
  /me llamo\b/i,
  /\bsoy\b/i,
  /\bmi\s+\w+\s+(es|son|se llama)\b/i,
  /\brecuerda que\b/i,
  /\bno olvides que\b/i,
  /\bprefiero\b/i,
  /\bme (gusta|gustan|encanta|encantan)\b/i,
  /\bodio\b/i,
  /\bal[eé]rgic[oa]/i,
  /\btengo\b/i,
  /\bcumplea[ñn]os\b/i,
  /\bhijo\b/i,
  /\bhija\b/i,
  /\bcita\b/i,
  /\bexamen\b/i,
  /\bvuelo\b/i,
  /\bentrega\b/i,
  /\bmañana\b/i,
  /\bpasado mañana\b/i,
  /\bel (lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i,
  /\btrabajo en\b/i,
  /\bvivo en\b/i,
  /\bestudio\b/i
];

// Charla que NUNCA genera memoria (mismo espíritu del gate trivial del watcher).
const BANTER_PATTERNS = [
  /^(?:gracias|muchas\s+gracias|mil\s+gracias|grax|ty|thx)\b/i,
  /^(?:jaj+a*|je+e+|xd+|:3|lol|lmao)\b/i,
  /^(?:ok|va|sim[oó]n|sale|listo|entendido|enterado|chido|arriba|de\s+acuerdo)\b/i,
  /^(?:buenos\s+d[ií]as|buenas\s+(tardes|noches)|hola|hey|qué\s+onda|qonda)\b/i,
  /^(?:ya\s+me\s+voy\s+a\s+dormir|a\s+mimir|buenas\s+noches|nos\s+vemos|adi[oó]s|bye)\b/i,
  /^(?:aqu[ií]\s+(ando|estoy)|estoy\s+en|ando\s+en|ya\s+(estoy|llegu[eé])|en\s+camino)\b/i,
  /^(?:ok\s+gracias|va\s+gracias|👍|👌|❤️|✨)\s*$/i
];

function isBanterText(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 4) return true;
  return BANTER_PATTERNS.some((re) => re.test(t));
}

function hasDurableMarker(text) {
  return MEMORY_MARKERS.some((re) => re.test(text));
}

function cleanKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñü ]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'dato';
}

function cleanVal(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 280);
}

/** Acota slots de perfil/preferencia a N palabras (evita arrastrar cláusulas). */
function shortVal(s, n = 6) {
  return cleanVal(String(s || '').split(/\s+/).slice(0, n).join(' '));
}

/**
 * Extrae 0–3 hechos {key, value, category} de un texto. Determinista.
 * Categorías: profile | preference | commitment | fact.
 */
function extractFacts(text) {
  const t = String(text || '').trim();
  if (!t || isBanterText(t)) return [];
  // Las preguntas no afirman hechos durables ("¿tienes cita?", "¿cuentan con...?").
  if (t.includes('?') || t.includes('¿')) return [];
  if (!hasDurableMarker(t)) return [];
  const facts = [];
  const push = (key, value, category) => {
    const v = cleanVal(value);
    if (!v || facts.length >= 3) return;
    const k = cleanKey(key);
    // Evita duplicados: misma key o valores que se contienen entre sí.
    if (facts.some((f) => f.key === k)) return;
    const low = v.toLowerCase();
    if (facts.some((f) => {
      const o = f.value.toLowerCase();
      return o.includes(low) || low.includes(o);
    })) return;
    facts.push({ key: k, value: v, category });
  };

  let m;
  // me llamo X -> profile.nombre
  m = t.match(/me llamo\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){0,3})/i);
  if (m) push('nombre', m[1], 'profile');

  // mi <attr> es|son|se llama <v> -> fact
  m = t.match(/\bmi\s+([a-záéíóúñü]+)\s+(?:es|son|se llama)\s+(.+?)(?:[.!;]|$)/i);
  if (m) push(m[1], m[2], m[1].toLowerCase().match(/hijo|hija|espos|novio|novia|perro|gato|mam[aá]|pap[aá]/) ? 'profile' : 'fact');

  // soy <v> -> profile/preference
  m = t.match(/\bsoy\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){0,4})/i);
  if (m && !/angel|erika/i.test(m[1])) push('condicion', m[1], 'preference');

  // recuerda que / no olvides que <v> -> fact
  m = t.match(/(?:recuerda que|no olvides que)\s+(.+?)(?:[.!;]|$)/i);
  if (m) push(m[1].split(/\s+/).slice(0, 4).join(' '), m[1], 'fact');

  // prefiero / me gusta / odio / alérgico -> preference (valor acotado)
  m = t.match(/\bprefiero\s+(.+?)(?:[.!;]|$)/i);
  if (m) push('preferencia', shortVal(m[1]), 'preference');
  m = t.match(/\bme\s+(?:gusta|gustan|encanta|encantan)\s+(.+?)(?:[.!;]|$)/i);
  if (m) push('gusto', shortVal(m[1]), 'preference');
  m = t.match(/\bodio\s+(.+?)(?:[.!;]|$)/i);
  if (m) push('disgusto', shortVal(m[1]), 'preference');
  m = t.match(/\b(?:soy\s+)?al[eé]rgic[oa]\s+a\s+(.+?)(?:[.!;]|$)/i);
  if (m) push('alergia', shortVal(m[1]), 'preference');

  // trabajo en / vivo en / estudio -> profile (valor acotado, sin cláusulas)
  m = t.match(/\btrabajo en\s+(.+?)(?:[.!;]|$)/i);
  if (m) push('trabajo', shortVal(m[1], 5), 'profile');
  m = t.match(/\bvivo en\s+(.+?)(?:[.!;]|$)/i);
  if (m) push('domicilio', shortVal(m[1], 5), 'profile');
  m = t.match(/\bcumplea[ñn]os(?:\s+es)?\s+(?:el\s+)?(.+?)(?:[.!;]|$)/i);
  if (m) push('cumpleanos', m[1], 'profile');

  // tengo <v> (tengo cita, tengo examen...) -> commitment si hay fecha.
  // No aplica a muletillas ("tengo otra pregunta", "tengo una duda").
  m = t.match(/\btengo\s+(.+?)(?:[.!;]|$)/i);
  if (m && !/^(otra|una|alguna|esa|esta)\s+(pregunta|duda|cosa)\b/i.test(m[1].trim())) {
    const hasDate = /(mañana|pasado|el (lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)|\d{1,2}(:\d{2})?\s*(am|pm)?|\d{1,2}\/\d{1,2})/i.test(m[1]);
    push(m[1].split(/\s+/).slice(0, 4).join(' '), `tengo ${m[1]}`, hasDate ? 'commitment' : 'fact');
  }

  // compromiso con fecha explícita (cita/examen/entrega/vuelo + fecha)
  m = t.match(/\b(cita|examen|entrega|vuelo|reuni[oó]n|clase)\b(.{0,120}?)(mañana|pasado mañana|el (lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)|\d{1,2}\/\d{1,2})/i);
  if (m) push(m[1], t.slice(Math.max(0, m.index - 20), m.index + 120), 'commitment');

  return facts.slice(0, 3);
}

/**
 * Nivel 2 (rescate): si las reglas no hallaron nada pero System One ve una
 * obligación con alta confianza y el texto no es banter, guarda un hecho
 * genérico. `gateFn` inyectable para tests. Timeout 2s, fail-open.
 */
async function rescueWithGate(text, gateFn, timeoutMs = 2000) {
  if (!gateFn) return null;
  const t = String(text || '').trim();
  if (!t || t.length < 16 || isBanterText(t)) return null;
  try {
    const res = await Promise.race([
      Promise.resolve().then(() => gateFn(t)),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
    if (res && res.isActionable && (res.confidence || 0) >= 0.8) {
      return { key: cleanKey(t.split(/\s+/).slice(0, 4).join(' ')), value: cleanVal(t), category: 'fact' };
    }
  } catch {}
  return null;
}

module.exports = {
  extractFacts,
  isBanterText,
  hasDurableMarker,
  rescueWithGate,
  cleanKey,
  cleanVal
};
