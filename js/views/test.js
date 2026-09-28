import * as store from '../store.js';
import { esc, fmt, fmtTime, fmtDate, pct, toast, LETTERS, $, $$ } from '../ui.js';
import { score, resultOf, pickBalanced, questionHistory } from '../scoring.js';

const SESSION_KEY = 'ot.session';

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveSession(s) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* sin almacenamiento: sigue en memoria */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* nada */ }
}

const usable = q => !q.annulled && Number.isInteger(q.answer) && q.options?.length >= 2;

export function startSession({ title, kind, examId = null, mode, minutes, questions }) {
  if (!questions.length) { alert('No hay preguntas que cumplan los filtros.'); return; }
  saveSession({
    id: store.uid(),
    title, kind, examId, mode,
    questions: questions.map(q => ({
      id: q.id, text: q.text, options: q.options, answer: q.answer, block: q.block || null,
      number: q.number ?? null, examName: q.examName, reserve: !!q.reserve,
    })),
    answers: questions.map(() => null),
    flags: questions.map(() => false),
    idx: 0,
    elapsed: 0,
    timeLimit: minutes > 0 ? minutes * 60 : null,
    startedAt: new Date().toISOString(),
  });
  location.hash = '#/run';
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
export function renderTestSetup(root) {
  const exams = store.getExams();
  const blocks = store.getBlocks();
  const all = store.allQuestions().filter(usable);
  const sources = [...exams.map(e => ({ id: e.id, name: e.name })), { id: '_manual', name: 'Preguntas sueltas' }];
  const countBy = (pred) => all.filter(pred).length;
  const running = getSession();

  root.innerHTML = `
    <h1>Hacer un test</h1>
    ${running ? `<div class="notice warn row"><span>Tienes un test sin terminar: <b>${esc(running.title)}</b>. Si empiezas otro, se descartará.</span><span class="spacer"></span><a class="btn sm primary" href="#/run">Continuar</a></div>` : ''}
    <div class="tabs" role="tablist">
      <button class="active" data-tab="exam">Examen completo</button>
      <button data-tab="random">Test aleatorio por bloques</button>
    </div>

    <form class="card" id="f-exam">
      ${exams.length ? `
      <label class="field"><span>Examen</span>
        <select name="exam">${exams.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${e.questions.length} preg.)</option>`).join('')}</select>
      </label>
      <label class="check"><input type="checkbox" name="reserve"> Incluir preguntas de reserva</label>
      ${commonOptions(120)}
      <button class="btn primary">Empezar examen</button>` : `<p class="empty">No hay exámenes. <a href="#/add">Añade uno</a>.</p>`}
    </form>

    <form class="card" id="f-random" hidden>
      <label class="field"><span>Número de preguntas</span>
        <input type="number" name="n" min="1" max="500" value="30">
      </label>
      <div class="field"><span class="small muted">Bloques (el test reparte las preguntas a partes iguales entre los marcados)</span>
        <div class="chips">
          ${blocks.map(b => `<label class="check"><input type="checkbox" name="block" value="${esc(b.id)}" checked> ${esc(b.name)} <span class="muted small">(${countBy(q => q.block === b.id)})</span></label>`).join('')}
          ${countBy(q => !blocks.some(b => b.id === q.block)) ? `<label class="check"><input type="checkbox" name="block" value="_none" checked> Sin bloque <span class="muted small">(${countBy(q => !blocks.some(b => b.id === q.block))})</span></label>` : ''}
        </div>
      </div>
      <details class="field"><summary class="small">Origen de las preguntas</summary>
        <div class="chips" style="margin-top:6px">
          ${sources.map(s => `<label class="check"><input type="checkbox" name="src" value="${esc(s.id)}" checked> ${esc(s.name)}</label>`).join('')}
        </div>
      </details>
      <label class="field"><span>Selección</span>
        <select name="priority">
          <option value="none">Aleatoria equilibrada</option>
          <option value="weak">Priorizar falladas, en blanco y no vistas</option>
          <option value="failed">Solo preguntas que he fallado o dejado en blanco</option>
          <option value="unseen">Solo preguntas que nunca he visto</option>
        </select>
      </label>
      ${commonOptions(0)}
      <p class="muted small" id="poolInfo"></p>
      <button class="btn primary">Generar test</button>
    </form>`;

  $$('.tabs button', root).forEach(b => b.onclick = () => {
    $$('.tabs button', root).forEach(x => x.classList.toggle('active', x === b));
    $('#f-exam').hidden = b.dataset.tab !== 'exam';
    $('#f-random').hidden = b.dataset.tab !== 'random';
  });

  const fe = $('#f-exam');
  fe.onsubmit = e => {
    e.preventDefault();
    const exam = store.getExam(fe.exam.value);
    const qs = exam.questions.filter(q => usable(q) && (fe.reserve.checked || !q.reserve)).sort((a, b) => a.number - b.number);
    startSession({ title: exam.name, kind: 'exam', examId: exam.id, mode: fe.mode.value, minutes: +fe.minutes.value, questions: qs });
  };

  const fr = $('#f-random');
  const history = questionHistory(store.getAttempts());
  const pool = () => {
    const bl = $$('input[name=block]:checked', fr).map(i => i.value);
    const src = $$('input[name=src]:checked', fr).map(i => i.value);
    const known = new Set(blocks.map(b => b.id));
    const p = fr.priority.value;
    return all.filter(q => {
      const bk = known.has(q.block) ? q.block : '_none';
      if (!bl.includes(bk)) return false;
      if (!src.includes(q.examId || '_manual')) return false;
      const h = history[q.id];
      if (p === 'failed' && !(h && (h.ko || h.blank))) return false;
      if (p === 'unseen' && h) return false;
      return true;
    });
  };
  const updateInfo = () => { $('#poolInfo').textContent = `${pool().length} preguntas disponibles con estos filtros.`; };
  fr.onchange = updateInfo;
  updateInfo();
  fr.onsubmit = e => {
    e.preventDefault();
    const qs = pickBalanced(pool(), +fr.n.value || 30, { history, priority: fr.priority.value === 'weak' ? 'weak' : 'none' });
    startSession({ title: `Test aleatorio (${qs.length} preguntas)`, kind: 'random', mode: fr.mode.value, minutes: +fr.minutes.value, questions: qs });
  };
}

function commonOptions(minutes) {
  return `
    <div class="grid grid-2" style="gap:0 16px">
      <label class="field"><span>Modo</span>
        <select name="mode">
          <option value="exam">Simulacro: corrección al final</option>
          <option value="practice">Práctica: ver la solución al responder</option>
        </select>
      </label>
      <label class="field"><span>Tiempo límite en minutos (0 = sin límite)</span>
        <input type="number" name="minutes" min="0" max="600" value="${minutes}">
      </label>
    </div>`;
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------
export function renderRunner(root) {
  const s = getSession();
  if (!s) { location.hash = '#/test'; return; }
  const n = s.questions.length;
  let timer = null;

  const draw = () => {
    const q = s.questions[s.idx];
    const chosen = s.answers[s.idx];
    const revealed = s.mode === 'practice' && chosen != null;
    const answered = s.answers.filter(a => a != null).length;
    root.innerHTML = `
      <div class="runner-head">
        <h2 style="margin:0">${esc(s.title)}</h2>
        <span class="spacer"></span>
        <span class="timer" id="timer"></span>
      </div>
      <div class="progress"><div style="width:${pct(answered, n)}%"></div></div>
      <div class="card">
        <div class="row small">
          <b>Pregunta ${s.idx + 1} de ${n}</b>
          ${q.block ? `<span class="tag">${esc(store.blockName(q.block))}</span>` : ''}
          ${q.reserve ? '<span class="tag warn">Reserva</span>' : ''}
          <span class="spacer"></span>
          <span class="muted">${esc(q.examName || '')}${q.number ? ' · nº ' + q.number : ''}</span>
        </div>
        <div class="qtext">${esc(q.text)}</div>
        <div class="opts">
          ${q.options.map((o, i) => {
            let cls = '';
            if (revealed) cls = i === q.answer ? 'correct' : i === chosen ? 'wrong' : '';
            else if (i === chosen) cls = 'selected';
            return `<button class="opt ${cls}" data-i="${i}" ${revealed ? 'disabled' : ''}><span class="letter">${LETTERS[i]}</span><span>${esc(o)}</span></button>`;
          }).join('')}
        </div>
        ${revealed ? `<div class="feedback ${chosen === q.answer ? 'good' : 'bad'}">${chosen === q.answer ? '✓ Correcto' : `✗ Incorrecto. La respuesta correcta es la ${LETTERS[q.answer]})`}</div>` : ''}
        <div class="runner-nav">
          <button class="btn" id="prev" ${s.idx === 0 ? 'disabled' : ''}>← Anterior</button>
          <button class="btn" id="flag">${s.flags[s.idx] ? '★ Marcada' : '☆ Marcar para revisar'}</button>
          ${chosen != null && !revealed ? '<button class="btn" id="clear">Dejar en blanco</button>' : ''}
          <span class="spacer"></span>
          ${s.idx < n - 1 ? '<button class="btn primary" id="next">Siguiente →</button>' : '<button class="btn primary" id="finish2">Terminar</button>'}
        </div>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <b>Hoja de respuestas</b>
          <span class="muted small">${answered} respondidas · ${n - answered} en blanco · ${s.flags.filter(Boolean).length} marcadas</span>
          <span class="spacer"></span>
          <button class="btn sm" id="quit">Abandonar</button>
          <button class="btn sm primary" id="finish">Terminar y corregir</button>
        </div>
        <div class="qgrid">
          ${s.questions.map((qq, i) => {
            const a = s.answers[i];
            let cls = a != null ? 'answered' : '';
            if (s.mode === 'practice' && a != null) cls = a === qq.answer ? 'ok' : 'ko';
            return `<button class="${cls} ${i === s.idx ? 'current' : ''} ${s.flags[i] ? 'flag' : ''}" data-go="${i}" title="Pregunta ${i + 1}">${i + 1}</button>`;
          }).join('')}
        </div>
        <p class="muted small" style="margin-top:10px">Atajos: teclas <b>A B C</b> para responder, <b>←/→</b> para moverte.</p>
      </div>`;

    $$('.opt', root).forEach(b => b.onclick = () => choose(+b.dataset.i));
    $('#prev').onclick = () => go(s.idx - 1);
    $('#next') && ($('#next').onclick = () => go(s.idx + 1));
    $('#flag').onclick = () => { s.flags[s.idx] = !s.flags[s.idx]; saveSession(s); draw(); };
    $('#clear') && ($('#clear').onclick = () => { s.answers[s.idx] = null; saveSession(s); draw(); });
    $('#finish').onclick = finish;
    $('#finish2') && ($('#finish2').onclick = finish);
    $('#quit').onclick = () => {
      if (confirm('¿Abandonar el test? No se guardará el resultado.')) { clearSession(); location.hash = '#/test'; }
    };
    $$('[data-go]', root).forEach(b => b.onclick = () => go(+b.dataset.go));
    tick(false);
  };

  const choose = i => {
    if (s.mode === 'practice' && s.answers[s.idx] != null) return;
    s.answers[s.idx] = s.answers[s.idx] === i ? null : i;
    saveSession(s);
    draw();
  };
  const go = i => {
    if (i < 0 || i >= n) return;
    s.idx = i;
    saveSession(s);
    draw();
    window.scrollTo({ top: 0 });
  };

  const finish = (auto = false) => {
    if (auto !== true) {
      const blanks = s.answers.filter(a => a == null).length;
      const msg = blanks ? `Tienes ${blanks} preguntas en blanco. ¿Terminar y corregir?` : '¿Terminar y corregir?';
      if (!confirm(msg)) return;
    }
    const attempt = {
      id: s.id,
      date: new Date().toISOString(),
      title: s.title,
      kind: s.kind,
      examId: s.examId,
      mode: s.mode,
      duration: Math.round(s.elapsed),
      items: s.questions.map((q, i) => ({ qid: q.id, block: q.block, chosen: s.answers[i], answer: q.answer })),
    };
    store.saveAttempt(attempt);
    clearSession();
    location.hash = '#/result/' + attempt.id;
  };

  const tick = (advance = true) => {
    if (advance) { s.elapsed += 1; saveSession(s); }
    const el = $('#timer');
    if (!el) return;
    if (s.timeLimit) {
      const left = s.timeLimit - s.elapsed;
      el.textContent = '⏱ ' + fmtTime(left);
      el.classList.toggle('low', left <= 300);
      if (left <= 0) { clearInterval(timer); toast('Tiempo agotado'); finish(true); }
    } else {
      el.textContent = '⏱ ' + fmtTime(s.elapsed);
    }
  };

  const onKey = e => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    const i = LETTERS.indexOf(k);
    if (i >= 0 && i < s.questions[s.idx].options.length) choose(i);
    else if (e.key === 'ArrowRight') go(s.idx + 1);
    else if (e.key === 'ArrowLeft') go(s.idx - 1);
  };

  draw();
  timer = setInterval(() => { if (!document.hidden) tick(); }, 1000);
  document.addEventListener('keydown', onKey);
  return () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
export function renderResult(root, id) {
  const a = store.getAttempts().find(x => x.id === id);
  if (!a) { root.innerHTML = '<p class="empty">Resultado no encontrado.</p>'; return; }
  const s = score(a.items);
  const byId = new Map(store.allQuestions().map(q => [q.id, q]));
  const blockRows = [...new Set(a.items.map(i => i.block || null))].map(b => {
    const r = score(a.items.filter(i => (i.block || null) === b));
    return { name: b ? store.blockName(b) : 'Sin bloque', ...r };
  }).sort((x, y) => y.total - x.total);

  root.innerHTML = `
    <h1>Resultado</h1>
    <div class="card">
      <div class="muted small">${esc(a.title)} · ${fmtDate(a.date)} · ${fmtTime(a.duration)} · ${a.mode === 'practice' ? 'práctica' : 'simulacro'}</div>
      <div class="score-hero" style="margin-top:10px">
        <div><div class="big" style="color:${s.grade >= 5 ? 'var(--good-ink)' : 'var(--bad-ink)'}">${fmt(s.grade)}</div><div class="muted small">nota sobre 10</div></div>
        <div class="grid grid-4" style="flex:1;min-width:260px">
          <div><div class="kpi v" style="padding:0">${s.correct}</div><div class="small">✓ aciertos</div></div>
          <div><div class="kpi v" style="padding:0">${s.wrong}</div><div class="small">✗ fallos</div></div>
          <div><div class="kpi v" style="padding:0">${s.blank}</div><div class="small">○ en blanco</div></div>
          <div><div class="kpi v" style="padding:0">${fmt(s.net)}</div><div class="small">puntos netos / ${s.total}</div></div>
        </div>
      </div>
      <p class="muted small" style="margin-top:12px">Neto = ${s.correct} − ${s.wrong}/3 = ${fmt(s.net)} · Los fallos te han restado ${fmt(s.wrong / 3)} puntos.</p>
      <div class="row" style="margin-top:8px">
        <a class="btn primary" href="#/test">Hacer otro test</a>
        ${s.wrong + s.blank ? '<button class="btn" id="retry">Repetir falladas y en blanco</button>' : ''}
        <a class="btn" href="#/stats">Estadísticas</a>
      </div>
    </div>

    <div class="card">
      <h2>Por bloque</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Bloque</th><th class="num">Preg.</th><th class="num">✓</th><th class="num">✗</th><th class="num">○</th><th class="num">Nota</th><th></th></tr></thead>
        <tbody>${blockRows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.total}</td><td class="num">${r.correct}</td><td class="num">${r.wrong}</td><td class="num">${r.blank}</td><td class="num">${fmt(r.grade)}</td>
          <td>${stackBar(r)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="row" style="margin-bottom:8px">
        <h2 style="margin:0">Revisión</h2><span class="spacer"></span>
        <select id="filter" style="width:auto">
          <option value="wrong">Falladas (${s.wrong})</option>
          <option value="blank">En blanco (${s.blank})</option>
          <option value="all">Todas (${a.items.length})</option>
          <option value="correct">Acertadas (${s.correct})</option>
        </select>
      </div>
      <div id="review"></div>
    </div>`;

  const drawReview = () => {
    const f = $('#filter').value;
    const rows = a.items.map((it, i) => ({ it, i, res: resultOf(it) })).filter(x => f === 'all' || x.res === f);
    $('#review').innerHTML = rows.length ? rows.map(({ it, i, res }) => {
      const q = byId.get(it.qid);
      if (!q) return `<div class="review-item muted">${i + 1}. (pregunta eliminada del banco)</div>`;
      return `<div class="review-item">
        <div class="row small"><b>${i + 1}.</b>
          <span class="tag ${res === 'correct' ? 'good' : res === 'wrong' ? 'bad' : ''}">${res === 'correct' ? 'Acierto' : res === 'wrong' ? 'Fallo' : 'En blanco'}</span>
          ${q.block ? `<span class="tag">${esc(store.blockName(q.block))}</span>` : ''}
          <span class="muted">${esc(q.examName)}${q.number ? ' · nº ' + q.number : ''}</span></div>
        <div style="margin-top:6px;font-weight:500">${esc(q.text)}</div>
        <ol>${q.options.map((o, j) => `<li class="${j === it.answer ? 'correct' : j === it.chosen ? 'wrong' : ''}"><b>${LETTERS[j]})</b> ${esc(o)}${j === it.chosen ? ' <span class="small">← tu respuesta</span>' : ''}</li>`).join('')}</ol>
      </div>`;
    }).join('') : '<p class="empty">Nada que mostrar.</p>';
  };
  $('#filter').onchange = drawReview;
  if (!s.wrong) $('#filter').value = s.blank ? 'blank' : 'all';
  drawReview();

  $('#retry') && ($('#retry').onclick = () => {
    const qs = a.items.filter(i => resultOf(i) !== 'correct').map(i => byId.get(i.qid)).filter(Boolean).filter(usable);
    startSession({ title: 'Repaso: ' + a.title, kind: 'random', mode: 'practice', minutes: 0, questions: qs });
  });
}

export function stackBar(r) {
  const t = r.total || 1;
  return `<div class="bar-track" title="${r.correct} aciertos, ${r.wrong} fallos, ${r.blank} en blanco">
    <span style="width:${(r.correct / t) * 100}%;background:var(--good)"></span>
    <span style="width:${(r.wrong / t) * 100}%;background:var(--bad)"></span>
    <span style="width:${(r.blank / t) * 100}%;background:var(--blank)"></span></div>`;
}
