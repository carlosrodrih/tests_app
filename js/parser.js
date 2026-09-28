// Conversión de texto de PDF a preguntas tipo test (a, b, c) y lectura de plantillas.
// Módulo puro: se usa en el navegador y en scripts de Node.

// Agrupa los items de texto de una página de pdf.js en líneas (por coordenada Y).
export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str && !it.hasEOL) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let lastEnd = null;
    for (const p of r.parts) {
      if (lastEnd !== null && p.x - lastEnd > 1.5 && !line.endsWith(' ') && !p.str.startsWith(' ')) line += ' ';
      line += p.str;
      lastEnd = p.x + p.w;
    }
    return line.replace(/\s+/g, ' ').trim();
  });
}

// Líneas que son cabeceras/pies de página y no deben formar parte de las preguntas.
const NOISE = [
  /^p\s*á\s*g\s*i\s*n\s*a\b/i,
  /^página\s+\d+/i,
  /^economía,\s*innovación/i,
  /^y hacienda$/i,
  /^\d+\s*\|\s*\d+$/,
];

function isNoise(line) {
  return !line || NOISE.some(re => re.test(line));
}

function clean(s) {
  return s.replace(/\s+/g, ' ').replace(/\s+([.,;:?!)])/g, '$1').trim();
}

// Extrae preguntas numeradas con opciones a), b), c) [y d) si existiera].
// Solo acepta el número esperado (anterior + 1) para no confundir "3/2007" o
// "1. " dentro de un enunciado con una nueva pregunta.
export function parseQuestions(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => !isNoise(l));
  const questions = [];
  let cur = null;
  let target = null; // 'text' | índice de opción
  let expected = 1;

  const qRe = /^(\d{1,3})\s*[.)-]\s*(.*)$/;
  const oRe = /^([a-dA-D])\s*\)\s*(.*)$/;

  const push = () => {
    if (!cur) return;
    cur.text = clean(cur.text);
    cur.options = cur.options.map(clean);
    questions.push(cur);
  };

  for (const line of lines) {
    const qm = line.match(qRe);
    if (qm && Number(qm[1]) === expected && (!cur || cur.options.length >= 2)) {
      push();
      cur = { number: expected, text: qm[2], options: [] };
      target = 'text';
      expected++;
      continue;
    }
    if (!cur) continue;
    const om = line.match(oRe);
    const letterIdx = om ? om[1].toLowerCase().charCodeAt(0) - 97 : -1;
    if (om && letterIdx === cur.options.length) {
      cur.options.push(om[2]);
      target = letterIdx;
      continue;
    }
    if (target === 'text') cur.text += ' ' + line;
    else cur.options[target] += ' ' + line;
  }
  push();
  return questions;
}

// Lee una plantilla de respuestas: pares "número letra" en cualquier formato
// ("1 A", "1-a", "1.A", "1) b"...). Devuelve { numero: índice 0..3 }.
export function parseAnswerKey(text) {
  const key = {};
  const re = /(?:^|[^\d])(\d{1,3})\s*[-.:)]?\s*([a-dA-D])(?![a-zA-ZáéíóúñÁÉÍÓÚÑ])/g;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (n > 0 && !(n in key)) key[n] = m[2].toLowerCase().charCodeAt(0) - 97;
  }
  return key;
}

// Clasificación automática aproximada por palabras clave. Devuelve el id de bloque o null.
export function guessBlock(q, blocks) {
  const txt = (q.text + ' ' + q.options.join(' ')).toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const b of blocks) {
    let score = 0;
    for (const kw of b.keywords || []) {
      const k = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(^|[^a-z0-9áéíóúüñ])' + k + '($|[^a-z0-9áéíóúüñ])').test(txt)) score++;
    }
    if (score > bestScore) { best = b.id; bestScore = score; }
  }
  return best;
}
