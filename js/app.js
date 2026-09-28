import * as store from './store.js';
import { esc, fmt, pct, toast, download, $ } from './ui.js';
import { score } from './scoring.js';
import { renderTestSetup, renderRunner, renderResult, getSession } from './views/test.js';
import { renderAdd } from './views/add.js';
import { renderBank } from './views/bank.js';
import { renderStats } from './views/stats.js';

const app = document.getElementById('app');
let cleanup = null;

const routes = {
  '': renderHome,
  test: renderTestSetup,
  run: renderRunner,
  result: renderResult,
  add: renderAdd,
  bank: renderBank,
  stats: renderStats,
  data: renderData,
};

function route() {
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const view = routes[name] || renderHome;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  document.querySelectorAll('#nav a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === name || (r === 'test' && (name === 'run' || name === 'result')));
  });
  window.scrollTo(0, 0);
  cleanup = view(app, ...params.map(decodeURIComponent));
}

function renderHome(root) {
  const exams = store.getExams();
  const qs = store.allQuestions();
  const attempts = store.getAttempts();
  const all = attempts.flatMap(a => a.items);
  const s = score(all);
  const avg = attempts.length ? attempts.reduce((acc, a) => acc + score(a.items).grade, 0) / attempts.length : null;
  const session = getSession();

  root.innerHTML = `
    <h1>Simulacros de test</h1>
    ${session ? `<div class="notice row"><span>Tienes un test sin terminar: <b>${esc(session.title)}</b>.</span><span class="spacer"></span><a class="btn primary sm" href="#/run">Continuar</a></div>` : ''}
    <div class="grid grid-4">
      <div class="card kpi"><div class="v">${qs.length}</div><div class="l">preguntas en el banco</div></div>
      <div class="card kpi"><div class="v">${exams.length}</div><div class="l">exámenes</div></div>
      <div class="card kpi"><div class="v">${attempts.length}</div><div class="l">tests realizados</div></div>
      <div class="card kpi"><div class="v">${avg == null ? '–' : fmt(avg)}</div><div class="l">nota media (sobre 10)</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h2>Resolver</h2>
        <p class="muted">Haz un examen oficial completo o un test aleatorio equilibrado por bloques.</p>
        <p><a class="btn primary" href="#/test">Empezar un test</a></p>
      </div>
      <div class="card">
        <h2>Añadir</h2>
        <p class="muted">Importa un examen en PDF con su plantilla, o añade preguntas sueltas.</p>
        <p><a class="btn" href="#/add">Añadir examen o preguntas</a></p>
      </div>
      <div class="card">
        <h2>Estadísticas</h2>
        <p class="muted">${all.length ? `Has respondido ${all.length} preguntas: ${pct(s.correct, s.total)} % aciertos, ${pct(s.wrong, s.total)} % fallos.` : 'Aún no has hecho ningún test.'}</p>
        <p><a class="btn" href="#/stats">Ver estadísticas</a></p>
      </div>
      <div class="card">
        <h2>Cómo se puntúa</h2>
        <p class="muted small">Cada pregunta tiene 3 opciones (a, b, c). Acierto <b>+1</b>, fallo <b>−1/3</b>, en blanco <b>0</b>.
        La nota sobre 10 es <code>(aciertos − fallos/3) / nº preguntas × 10</code>.</p>
      </div>
    </div>`;
}

function renderData(root) {
  root.innerHTML = `
    <h1>Datos y copia de seguridad</h1>
    <div class="card">
      <p>Todo lo que añades (exámenes, preguntas, resultados) se guarda <b>en este navegador</b>.
      Para pasarlo a otro dispositivo o no perderlo, descarga una copia y restáurala donde quieras.</p>
      <div class="row">
        <button class="btn primary" id="exp">Descargar copia (.json)</button>
        <label class="btn">Restaurar copia<input type="file" id="imp" accept=".json,application/json" hidden></label>
      </div>
    </div>
    <div class="card">
      <h2>Borrar</h2>
      <div class="row">
        <button class="btn danger" id="clearAttempts">Borrar historial de tests</button>
        <button class="btn danger" id="clearAll">Borrar todos mis datos</button>
      </div>
      <p class="muted small">Los exámenes incluidos con la aplicación no se borran.</p>
    </div>`;

  $('#exp').onclick = () => download(`oposi-test-${new Date().toISOString().slice(0, 10)}.json`, store.exportAll());
  $('#imp').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      store.importAll(JSON.parse(await f.text()));
      toast('Copia restaurada');
    } catch (err) { alert(err.message); }
  };
  $('#clearAttempts').onclick = () => {
    if (confirm('¿Borrar todo el historial de tests y estadísticas?')) { store.clearAttempts(); toast('Historial borrado'); }
  };
  $('#clearAll').onclick = () => {
    if (!confirm('¿Borrar exámenes importados, preguntas sueltas, bloques y resultados? No se puede deshacer.')) return;
    Object.keys(localStorage).filter(k => k.startsWith('ot.')).forEach(k => localStorage.removeItem(k));
    toast('Datos borrados');
  };
}

window.addEventListener('hashchange', route);
store.loadBuiltin().then(route);
