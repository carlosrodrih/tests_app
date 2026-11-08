import * as store from '../store.js';
import { itemsToLines, parseQuestions, parseAnswerKey, guessBlock } from '../parser.js';
import { esc, toast, LETTERS, $, $$ } from '../ui.js';

const PDFJS = new URL('../../vendor/pdfjs/', import.meta.url).href;

async function pdfToText(file) {
  const pdfjs = await import(PDFJS + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    lines.push(...itemsToLines(content.items));
  }
  return lines.join('\n');
}

const blockOptions = (blocks, sel) =>
  `<option value="">— Sin bloque —</option>` +
  blocks.map(b => `<option value="${esc(b.id)}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

export function renderAdd(root) {
  root.innerHTML = `
    <h1>Añadir</h1>
    <div class="tabs">
      <button class="active" data-tab="pdf">Examen completo (PDF + plantilla)</button>
      <button data-tab="json">Examen en JSON</button>
      <button data-tab="manual">Pregunta suelta</button>
    </div>
    <div id="tab"></div>`;
  const tabs = { pdf: renderImport, json: renderJsonImport, manual: renderManual };
  $$('.tabs button', root).forEach(b => b.onclick = () => {
    $$('.tabs button', root).forEach(x => x.classList.toggle('active', x === b));
    tabs[b.dataset.tab]($('#tab'));
  });
  renderImport($('#tab'));
}

// ---------------------------------------------------------------------------
// Importar examen
// ---------------------------------------------------------------------------
function renderImport(el) {
  let parsed = null; // { questions: [...] }
  const blocks = store.getBlocks();

  el.innerHTML = `
    <form class="card" id="imp">
      <h2>1. Archivos</h2>
      <div class="grid grid-2" style="gap:0 16px">
        <label class="field"><span>Nombre del examen</span><input type="text" name="name" required placeholder="p. ej. 2024 · Técnico TIC Ayto. Madrid"></label>
        <label class="field"><span>Fecha</span><input type="date" name="date"></label>
        <label class="field"><span>PDF del examen</span><input type="file" name="exam" accept="application/pdf"></label>
        <label class="field"><span>PDF de la plantilla de respuestas</span><input type="file" name="key" accept="application/pdf"></label>
      </div>
      <details class="field"><summary class="small">¿El PDF no tiene texto seleccionable? Pega el texto aquí</summary>
        <div class="grid grid-2" style="margin-top:8px">
          <label class="field"><span>Texto del examen</span><textarea name="examText" rows="6" placeholder="1. Enunciado...&#10;a) ...&#10;b) ...&#10;c) ..."></textarea></label>
          <label class="field"><span>Plantilla</span><textarea name="keyText" rows="6" placeholder="1 A&#10;2 C&#10;3 B ..."></textarea></label>
        </div>
      </details>
      <label class="field" style="max-width:320px"><span>Nº de preguntas ordinarias (las siguientes serán de reserva)</span><input type="number" name="ordinary" min="0" placeholder="todas"></label>
      <button class="btn primary" id="parseBtn">Leer examen</button>
      <span class="muted small" id="status"></span>
    </form>
    <div id="preview"></div>`;

  const f = $('#imp');
  f.onsubmit = async e => {
    e.preventDefault();
    const status = $('#status');
    try {
      status.textContent = 'Leyendo…';
      const examText = f.exam.files[0] ? await pdfToText(f.exam.files[0]) : f.examText.value;
      const keyText = f.key.files[0] ? await pdfToText(f.key.files[0]) : f.keyText.value;
      if (!examText.trim()) throw new Error('Sube el PDF del examen o pega su texto.');
      const qs = parseQuestions(examText);
      if (!qs.length) throw new Error('No se han encontrado preguntas. Si el PDF es una imagen escaneada, no tiene texto: pega el texto (p. ej. tras pasarlo por un OCR).');
      const key = parseAnswerKey(keyText);
      const ordinary = +f.ordinary.value || qs.length;
      parsed = qs.map(q => ({
        ...q,
        answer: key[q.number] ?? null,
        block: guessBlock(q, blocks),
        reserve: q.number > ordinary,
      }));
      status.textContent = '';
      drawPreview();
    } catch (err) {
      status.textContent = '';
      alert(err.message);
    }
  };

  const drawPreview = () => {
    const missing = parsed.filter(q => q.answer == null).length;
    const odd = parsed.filter(q => q.options.length !== 3).length;
    const gaps = parsed.length ? parsed[parsed.length - 1].number - parsed.length : 0;
    $('#preview').innerHTML = `
      <div class="card">
        <h2>2. Revisa y asigna bloques</h2>
        <p><b>${parsed.length}</b> preguntas leídas · ${parsed.filter(q => q.reserve).length} de reserva.</p>
        ${missing ? `<div class="notice warn">${missing} preguntas sin respuesta en la plantilla: elígela abajo (o se quedarán fuera de los tests; también pueden ser anuladas).</div>` : ''}
        ${odd ? `<div class="notice warn">${odd} preguntas no tienen exactamente 3 opciones: revísalas.</div>` : ''}
        ${gaps ? `<div class="notice bad">Parece que faltan preguntas en la numeración.</div>` : ''}
        <div class="row" style="margin:12px 0">
          <span class="small">Asignar bloque por rango:</span>
          <input type="number" id="rFrom" placeholder="desde" style="width:90px">
          <input type="number" id="rTo" placeholder="hasta" style="width:90px">
          <select id="rBlock" style="width:auto">${blockOptions(blocks, '')}</select>
          <button class="btn sm" id="rApply">Aplicar</button>
        </div>
        <p class="muted small">El bloque se ha propuesto automáticamente por palabras clave; corrígelo si hace falta. Pulsa una pregunta para editar su texto.</p>
        <div class="table-wrap"><table>
          <thead><tr><th class="num">Nº</th><th>Pregunta</th><th>Resp.</th><th>Bloque</th><th>Reserva</th></tr></thead>
          <tbody>${parsed.map((q, i) => `
            <tr>
              <td class="num">${q.number}</td>
              <td><details><summary class="clamp">${esc(q.text)}</summary>
                <label class="field" style="margin-top:6px"><span>Enunciado</span><textarea data-i="${i}" data-k="text">${esc(q.text)}</textarea></label>
                ${q.options.map((o, j) => `<label class="field"><span>${LETTERS[j]})</span><textarea rows="2" data-i="${i}" data-k="opt" data-j="${j}">${esc(o)}</textarea></label>`).join('')}
              </details></td>
              <td><select data-i="${i}" data-k="answer" style="width:64px">
                <option value="">–</option>${q.options.map((_, j) => `<option value="${j}" ${q.answer === j ? 'selected' : ''}>${LETTERS[j]}</option>`).join('')}
              </select></td>
              <td><select data-i="${i}" data-k="block" style="min-width:160px">${blockOptions(blocks, q.block)}</select></td>
              <td><input type="checkbox" data-i="${i}" data-k="reserve" ${q.reserve ? 'checked' : ''}></td>
            </tr>`).join('')}</tbody>
        </table></div>
        <div class="row" style="margin-top:14px"><button class="btn primary" id="save">3. Guardar examen</button></div>
      </div>`;

    $$('#preview [data-k]').forEach(inp => inp.onchange = () => {
      const q = parsed[+inp.dataset.i];
      const k = inp.dataset.k;
      if (k === 'text') q.text = inp.value.trim();
      else if (k === 'opt') q.options[+inp.dataset.j] = inp.value.trim();
      else if (k === 'answer') q.answer = inp.value === '' ? null : +inp.value;
      else if (k === 'block') q.block = inp.value || null;
      else if (k === 'reserve') q.reserve = inp.checked;
    });
    $('#rApply').onclick = () => {
      const from = +$('#rFrom').value || 1, to = +$('#rTo').value || Infinity;
      parsed.forEach(q => { if (q.number >= from && q.number <= to) q.block = $('#rBlock').value || null; });
      drawPreview();
    };
    $('#save').onclick = () => {
      const name = f.name.value.trim();
      if (!name) { alert('Ponle un nombre al examen.'); f.name.focus(); return; }
      const exam = {
        id: 'u-' + store.uid(),
        name,
        date: f.date.value || null,
        questions: parsed.map(q => ({ number: q.number, text: q.text, options: q.options, answer: q.answer, block: q.block, reserve: q.reserve })),
      };
      if (store.saveExam(exam)) {
        toast('Examen guardado');
        location.hash = '#/bank';
      }
    };
  };
}

// ---------------------------------------------------------------------------
// Importar examen en JSON (mismo formato que data/exams/*.json)
// ---------------------------------------------------------------------------
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Valida un examen y lo deja en el formato interno. Lanza un Error si no es usable.
export function normalizeExamJson(raw, blockIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('No es un objeto de examen.');
  const name = String(raw.name || '').trim();
  if (!name) throw new Error('Falta "name".');
  if (!Array.isArray(raw.questions) || !raw.questions.length) throw new Error(`"${name}": falta la lista "questions".`);
  const warnings = [];
  const seen = new Set();
  const unknownBlocks = new Set();
  const questions = raw.questions.map((q, i) => {
    const where = `"${name}", pregunta ${q?.number ?? i + 1}`;
    if (!q || typeof q.text !== 'string' || !q.text.trim()) throw new Error(`${where}: falta "text".`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || q.options.some(o => typeof o !== 'string'))
      throw new Error(`${where}: "options" debe ser una lista de 2 a 4 textos.`);
    const number = Number.isInteger(q.number) ? q.number : i + 1;
    if (seen.has(number)) throw new Error(`${where}: número repetido.`);
    seen.add(number);
    let answer = q.answer;
    if (typeof answer === 'string' && /^[a-d]$/i.test(answer.trim())) answer = answer.trim().toLowerCase().charCodeAt(0) - 97;
    if (!(Number.isInteger(answer) && answer >= 0 && answer < q.options.length)) answer = null;
    let block = q.block || null;
    if (block && !blockIds.includes(block)) { unknownBlocks.add(block); block = null; }
    return {
      number, text: q.text.trim(), options: q.options.map(o => o.trim()), answer, block,
      reserve: !!q.reserve, ...(q.annulled ? { annulled: true } : {}), ...(q.source ? { source: String(q.source) } : {}),
    };
  }).sort((a, b) => a.number - b.number);
  const noAnswer = questions.filter(q => q.answer == null).length;
  if (noAnswer) warnings.push(`${noAnswer} preguntas sin respuesta válida (no saldrán en los tests hasta que la indiques).`);
  if (unknownBlocks.size) warnings.push(`Bloques desconocidos (${[...unknownBlocks].join(', ')}): esas preguntas quedan "Sin bloque".`);
  return {
    exam: {
      id: String(raw.id || '').trim() || slug(name) || 'u-' + store.uid(),
      name, date: raw.date || null, ...(raw.ordinary ? { ordinary: raw.ordinary } : {}), questions,
    },
    warnings,
  };
}

function renderJsonImport(el) {
  let pending = [];
  el.innerHTML = `
    <div class="card">
      <p>Importa uno o varios exámenes ya convertidos a JSON. Formato:</p>
      <pre class="small" style="overflow-x:auto;background:var(--surface-2);padding:10px;border-radius:8px">{
  "id": "2025-a1-madrid-tic",          (opcional)
  "name": "2025 · Técnico/a Superior TIC (A1)",
  "date": "2025-06-21",                 (opcional)
  "questions": [
    { "number": 1, "text": "Enunciado…",
      "options": ["opción a", "opción b", "opción c"],
      "answer": 2,          (0 = a, 1 = b, 2 = c; también vale "c")
      "block": "b1",        (opcional: ${esc(store.getBlocks().map(b => b.id).join(', '))})
      "reserve": false }    (opcional)
  ]
}</pre>
      <p class="muted small">También se acepta una lista <code>[ {...}, {...} ]</code> con varios exámenes.</p>
      <label class="field"><span>Archivos .json</span><input type="file" id="jfiles" accept=".json,application/json" multiple></label>
      <details class="field"><summary class="small">…o pega el JSON aquí</summary>
        <textarea id="jtext" rows="8" style="margin-top:8px;font-family:monospace;font-size:.85rem"></textarea>
        <button class="btn sm" id="jparse" style="margin-top:6px">Leer texto</button>
      </details>
      <div id="jresult"></div>
    </div>`;

  const read = sources => {
    const blockIds = store.getBlocks().map(b => b.id);
    const existing = new Map(store.getExams().map(e => [e.id, e]));
    const errors = [];
    pending = [];
    for (const { label, text } of sources) {
      let data;
      try { data = JSON.parse(text); } catch (e) { errors.push(`${label}: JSON no válido (${e.message}).`); continue; }
      for (const raw of Array.isArray(data) ? data : [data]) {
        try {
          const r = normalizeExamJson(raw, blockIds);
          const prev = existing.get(r.exam.id);
          if (prev?.builtin) r.warnings.push('Ya está incluido en la aplicación: no hace falta importarlo.');
          else if (prev) r.warnings.push('Ya existe un examen con este id: se reemplazará.');
          r.skip = !!prev?.builtin;
          pending.push(r);
        } catch (e) { errors.push(`${label}: ${e.message}`); }
      }
    }
    draw(errors);
  };

  const draw = errors => {
    const toSave = pending.filter(p => !p.skip);
    $('#jresult').innerHTML = `
      ${errors.map(e => `<div class="notice bad">${esc(e)}</div>`).join('')}
      ${pending.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Examen</th><th class="num">Preg.</th><th class="num">Reserva</th><th>Avisos</th></tr></thead>
        <tbody>${pending.map(({ exam, warnings }) => `<tr>
          <td>${esc(exam.name)}<div class="muted small">${esc(exam.id)}${exam.date ? ' · ' + esc(exam.date) : ''}</div></td>
          <td class="num">${exam.questions.length}</td><td class="num">${exam.questions.filter(q => q.reserve).length}</td>
          <td class="small">${warnings.map(esc).join('<br>') || '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      ${toSave.length ? `<p style="margin-top:12px"><button class="btn primary" id="jsave">Guardar ${toSave.length === 1 ? 'examen' : toSave.length + ' exámenes'}</button></p>` : ''}` : ''}`;
    $('#jsave') && ($('#jsave').onclick = () => {
      if (toSave.every(({ exam }) => store.saveExam(exam))) {
        toast(toSave.length === 1 ? 'Examen guardado' : `${toSave.length} exámenes guardados`);
        location.hash = '#/bank';
      }
    });
  };

  $('#jfiles').onchange = async e => {
    const files = [...e.target.files];
    if (files.length) read(await Promise.all(files.map(async f => ({ label: f.name, text: await f.text() }))));
  };
  $('#jparse').onclick = () => read([{ label: 'Texto pegado', text: $('#jtext').value }]);
}

// ---------------------------------------------------------------------------
// Pregunta suelta
// ---------------------------------------------------------------------------
function renderManual(el) {
  const blocks = store.getBlocks();
  el.innerHTML = `
    <form class="card" id="man">
      <label class="field"><span>Enunciado</span><textarea name="text" required rows="3"></textarea></label>
      ${['a', 'b', 'c'].map((l, i) => `
        <div class="row" style="align-items:flex-start;margin-bottom:10px">
          <label class="check" title="Marcar como correcta"><input type="radio" name="answer" value="${i}" ${i === 0 ? 'checked' : ''}> <b>${l})</b></label>
          <textarea name="o${i}" required rows="2" style="flex:1;min-height:44px" placeholder="Opción ${l}"></textarea>
        </div>`).join('')}
      <p class="muted small">Marca el círculo de la opción correcta.</p>
      <div class="grid grid-2" style="gap:0 16px">
        <label class="field"><span>Bloque</span><select name="block">${blockOptions(blocks, blocks[0]?.id)}</select></label>
        <label class="field"><span>Fuente / nota (opcional)</span><input type="text" name="source" placeholder="p. ej. Ley 39/2015 art. 21"></label>
      </div>
      <button class="btn primary">Guardar pregunta</button>
    </form>
    <div class="card"><h2>Preguntas sueltas guardadas</h2><div id="mlist"></div></div>`;

  const drawList = () => {
    const qs = store.getManualQuestions();
    $('#mlist').innerHTML = qs.length ? `<div class="table-wrap"><table><tbody>${qs.slice().reverse().map(q => `
      <tr><td>${esc(q.text)}<div class="muted small">Correcta: ${LETTERS[q.answer]}) ${esc(q.options[q.answer])}</div></td>
      <td><span class="tag">${esc(store.blockName(q.block))}</span></td>
      <td><button class="btn sm danger" data-del="${esc(q.id)}">Borrar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">Todavía no has añadido preguntas sueltas.</p>';
    $$('[data-del]', el).forEach(b => b.onclick = () => {
      if (confirm('¿Borrar esta pregunta?')) { store.deleteManualQuestion(b.dataset.del); drawList(); }
    });
  };

  const f = $('#man');
  f.onsubmit = e => {
    e.preventDefault();
    const q = {
      id: 'm-' + store.uid(),
      text: f.text.value.trim(),
      options: [f.o0.value.trim(), f.o1.value.trim(), f.o2.value.trim()],
      answer: +f.answer.value,
      block: f.block.value || null,
      source: f.source.value.trim() || null,
      createdAt: new Date().toISOString(),
    };
    if (store.saveManualQuestion(q)) {
      toast('Pregunta guardada');
      const keepBlock = f.block.value;
      f.reset();
      f.block.value = keepBlock;
      f.text.focus();
      drawList();
    }
  };
  drawList();
}
