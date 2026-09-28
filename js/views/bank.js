import * as store from '../store.js';
import { esc, toast, LETTERS, $, $$ } from '../ui.js';
import { questionHistory } from '../scoring.js';

export function renderBank(root) {
  const blocks = store.getBlocks();
  const exams = store.getExams();
  const history = questionHistory(store.getAttempts());
  let limit = 50;

  root.innerHTML = `
    <h1>Banco de preguntas</h1>
    <div class="card">
      <div class="row">
        <input type="search" id="q" placeholder="Buscar texto…" style="flex:2;min-width:180px">
        <select id="fx" style="flex:1;min-width:160px">
          <option value="">Todos los orígenes</option>
          ${exams.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}
          <option value="_manual">Preguntas sueltas</option>
        </select>
        <select id="fb" style="flex:1;min-width:160px">
          <option value="">Todos los bloques</option>
          ${blocks.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}
          <option value="_none">Sin bloque</option>
        </select>
      </div>
      <p class="muted small" id="count"></p>
      <div id="list"></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>Exámenes</h2>
        <div class="table-wrap"><table><tbody>
          ${exams.map(e => `<tr><td>${esc(e.name)}<div class="muted small">${e.questions.length} preguntas${e.builtin ? ' · incluido' : ''}</div></td>
            <td class="num">${e.builtin ? '' : `<button class="btn sm danger" data-delexam="${esc(e.id)}">Borrar</button>`}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card">
        <h2>Bloques / temáticas</h2>
        <div id="blocks"></div>
        <form class="row" id="newBlock" style="margin-top:10px">
          <input type="text" name="name" placeholder="Nuevo bloque" required style="flex:1">
          <button class="btn sm">Añadir</button>
        </form>
      </div>
    </div>`;

  const draw = () => {
    const text = $('#q').value.trim().toLowerCase();
    const fx = $('#fx').value, fb = $('#fb').value;
    const known = new Set(blocks.map(b => b.id));
    const qs = store.allQuestions().filter(q =>
      (!fx || (q.examId || '_manual') === fx) &&
      (!fb || (fb === '_none' ? !known.has(q.block) : q.block === fb)) &&
      (!text || (q.text + ' ' + q.options.join(' ')).toLowerCase().includes(text)));
    $('#count').textContent = `${qs.length} preguntas`;
    $('#list').innerHTML = qs.length ? qs.slice(0, limit).map(q => {
      const h = history[q.id];
      return `<div class="review-item">
        <div class="row small">
          <span class="muted">${esc(q.examName)}${q.number ? ' · nº ' + q.number : ''}</span>
          ${q.reserve ? '<span class="tag warn">Reserva</span>' : ''}
          ${q.annulled ? '<span class="tag bad">Anulada</span>' : ''}
          ${q.answer == null ? '<span class="tag bad">Sin respuesta</span>' : ''}
          ${h ? `<span class="tag">${h.ok}✓ ${h.ko}✗ ${h.blank}○</span>` : ''}
        </div>
        <details><summary style="margin-top:4px;font-weight:500">${esc(q.text)}</summary>
          <ol>${q.options.map((o, j) => `<li class="${j === q.answer ? 'correct' : ''}"><b>${LETTERS[j]})</b> ${esc(o)}</li>`).join('')}</ol>
          ${q.source ? `<p class="muted small">Fuente: ${esc(q.source)}</p>` : ''}
        </details>
        <div class="row small" style="margin-top:6px">
          <select data-id="${esc(q.id)}" data-k="block" style="width:auto">
            <option value="">— Sin bloque —</option>
            ${blocks.map(b => `<option value="${esc(b.id)}" ${b.id === q.block ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>
          <label>Correcta
            <select data-id="${esc(q.id)}" data-k="answer" style="width:auto">
              <option value="">–</option>${q.options.map((_, j) => `<option value="${j}" ${q.answer === j ? 'selected' : ''}>${LETTERS[j]}</option>`).join('')}
            </select></label>
          <label class="check"><input type="checkbox" data-id="${esc(q.id)}" data-k="annulled" ${q.annulled ? 'checked' : ''}> Anulada</label>
        </div>
      </div>`;
    }).join('') + (qs.length > limit ? `<p style="text-align:center"><button class="btn" id="more">Ver más</button></p>` : '')
      : '<p class="empty">No hay preguntas con estos filtros.</p>';

    const byId = new Map(qs.map(q => [q.id, q]));
    $$('#list [data-k]').forEach(inp => inp.onchange = () => {
      const q = byId.get(inp.dataset.id);
      const k = inp.dataset.k;
      const v = k === 'annulled' ? inp.checked : k === 'answer' ? (inp.value === '' ? null : +inp.value) : (inp.value || null);
      store.updateQuestion(q, { [k]: v });
      toast('Guardado');
    });
    $('#more') && ($('#more').onclick = () => { limit += 50; draw(); });
  };

  const drawBlocks = () => {
    const counts = {};
    store.allQuestions().forEach(q => { counts[q.block] = (counts[q.block] || 0) + 1; });
    const bl = store.getBlocks();
    $('#blocks').innerHTML = bl.map((b, i) => `
      <div class="row" style="margin-bottom:8px">
        <span class="dot" style="background:${store.blockColor(i)}"></span>
        <input type="text" value="${esc(b.name)}" data-rename="${esc(b.id)}" style="flex:1">
        <span class="muted small">${counts[b.id] || 0}</span>
        <button class="btn sm danger" data-delblock="${esc(b.id)}" title="Borrar bloque">✕</button>
      </div>`).join('');
    $$('[data-rename]').forEach(inp => inp.onchange = () => {
      store.saveBlocks(store.getBlocks().map(b => b.id === inp.dataset.rename ? { ...b, name: inp.value.trim() || b.name } : b));
      toast('Bloque renombrado');
    });
    $$('[data-delblock]').forEach(btn => btn.onclick = () => {
      if (!confirm('¿Borrar el bloque? Sus preguntas quedarán "Sin bloque".')) return;
      store.saveBlocks(store.getBlocks().filter(b => b.id !== btn.dataset.delblock));
      renderBank(root);
    });
  };

  $('#newBlock').onsubmit = e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    store.saveBlocks([...store.getBlocks(), { id: 'b-' + store.uid(), name, keywords: [] }]);
    renderBank(root);
  };
  $$('[data-delexam]').forEach(btn => btn.onclick = () => {
    if (!confirm('¿Borrar este examen y sus preguntas? Los resultados ya guardados se mantienen.')) return;
    store.deleteExam(btn.dataset.delexam);
    renderBank(root);
  });

  ['#q', '#fx', '#fb'].forEach(s => $(s).oninput = () => { limit = 50; draw(); });
  draw();
  drawBlocks();
}
