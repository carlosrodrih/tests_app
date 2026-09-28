import * as store from '../store.js';
import { esc, fmt, fmtDate, fmtTime, pct, css, $, $$ } from '../ui.js';
import { score, questionHistory } from '../scoring.js';
import { startSession, stackBar } from './test.js';

export function renderStats(root) {
  const charts = [];
  const all = store.getAttempts();

  if (!all.length) {
    root.innerHTML = `<h1>Estadísticas</h1><div class="card empty">Aún no hay resultados. <a href="#/test">Haz tu primer test</a>.</div>`;
    return;
  }

  root.innerHTML = `
    <h1>Estadísticas</h1>
    <div class="card row">
      <label class="small">Periodo
        <select id="fp" style="width:auto">
          <option value="0">Todo</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option>
        </select></label>
      <label class="small">Tipo
        <select id="fk" style="width:auto">
          <option value="">Todos</option><option value="exam">Exámenes completos</option><option value="random">Tests aleatorios</option>
        </select></label>
    </div>
    <div id="body"></div>`;

  const draw = () => {
    charts.splice(0).forEach(c => c.destroy());
    const days = +$('#fp').value, kind = $('#fk').value;
    const since = days ? Date.now() - days * 864e5 : 0;
    const attempts = all.filter(a => new Date(a.date).getTime() >= since && (!kind || a.kind === kind));
    const body = $('#body');
    if (!attempts.length) { body.innerHTML = '<div class="card empty">No hay tests en este periodo.</div>'; return; }

    const qById = new Map(store.allQuestions().map(q => [q.id, q]));
    // El bloque se toma de la pregunta actual (por si se ha reasignado después).
    const items = attempts.flatMap(a => a.items).map(i => ({ ...i, block: qById.get(i.qid)?.block ?? i.block ?? null }));
    const s = score(items);
    const avg = attempts.reduce((acc, a) => acc + score(a.items).grade, 0) / attempts.length;
    const blocks = store.getBlocks();
    const blockIdx = new Map(blocks.map((b, i) => [b.id, i]));
    const blockRows = [...blocks.map(b => b.id), null].map(id => {
      const its = items.filter(i => (blockIdx.has(i.block) ? i.block : null) === id);
      return { id, name: id ? store.blockName(id) : 'Sin bloque', color: id ? store.blockColor(blockIdx.get(id)) : css('--blank'), ...score(its) };
    }).filter(r => r.total);
    const worst = [...blockRows].sort((a, b) => (b.wrong + b.blank) / b.total - (a.wrong + a.blank) / a.total)[0];
    const hist = questionHistory(attempts);
    const failed = Object.entries(hist).filter(([, h]) => h.ko).map(([id, h]) => ({ q: qById.get(id), h })).filter(x => x.q)
      .sort((a, b) => b.h.ko - a.h.ko || (b.h.ko / b.h.seen) - (a.h.ko / a.h.seen)).slice(0, 15);

    body.innerHTML = `
      <div class="grid grid-4">
        <div class="card kpi"><div class="v">${attempts.length}</div><div class="l">tests realizados</div></div>
        <div class="card kpi"><div class="v">${s.total}</div><div class="l">preguntas respondidas</div></div>
        <div class="card kpi"><div class="v">${pct(s.correct, s.total)} %</div><div class="l">de aciertos</div></div>
        <div class="card kpi"><div class="v">${fmt(avg)}</div><div class="l">nota media /10</div></div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>Aciertos, fallos y en blanco</h2>
          <div class="chart-box tall"><canvas id="cPie" aria-label="Aciertos ${s.correct}, fallos ${s.wrong}, en blanco ${s.blank}"></canvas></div>
        </div>
        <div class="card">
          <h2>¿En qué bloque fallas más?</h2>
          <p class="muted small" style="margin-top:-6px">Reparto de tus fallos por bloque${worst ? ` · Peor rendimiento: <b>${esc(worst.name)}</b> (${pct(worst.wrong + worst.blank, worst.total)} % sin acertar)` : ''}</p>
          <div class="chart-box tall"><canvas id="cFailBlock"></canvas></div>
        </div>
      </div>

      <div class="card">
        <h2>Rendimiento por bloque</h2>
        <div class="chart-box" style="height:${Math.max(160, blockRows.length * 56 + 60)}px"><canvas id="cBlocks"></canvas></div>
        <div class="table-wrap" style="margin-top:12px"><table>
          <thead><tr><th>Bloque</th><th class="num">Preg.</th><th class="num">✓</th><th class="num">✗</th><th class="num">○</th><th class="num">% acierto</th><th class="num">Nota</th><th></th></tr></thead>
          <tbody>${blockRows.map(r => `<tr><td><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</td>
            <td class="num">${r.total}</td><td class="num">${r.correct}</td><td class="num">${r.wrong}</td><td class="num">${r.blank}</td>
            <td class="num">${pct(r.correct, r.total)} %</td><td class="num">${fmt(r.grade)}</td><td>${stackBar(r)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>

      ${attempts.length > 1 ? `<div class="card"><h2>Evolución de la nota</h2><div class="chart-box"><canvas id="cLine"></canvas></div></div>` : ''}

      <div class="card">
        <div class="row" style="margin-bottom:8px"><h2 style="margin:0">Preguntas que más fallas</h2><span class="spacer"></span>
          ${failed.length ? '<button class="btn sm primary" id="drill">Test con mis falladas</button>' : ''}</div>
        ${failed.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Pregunta</th><th>Bloque</th><th class="num">Fallos</th><th class="num">Vista</th></tr></thead>
          <tbody>${failed.map(({ q, h }) => `<tr><td><div class="clamp">${esc(q.text)}</div><div class="muted small">${esc(q.examName)}${q.number ? ' · nº ' + q.number : ''}</div></td>
            <td class="small">${esc(store.blockName(q.block))}</td><td class="num">${h.ko}</td><td class="num">${h.seen}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty">¡Ningún fallo todavía!</p>'}
      </div>

      <div class="card">
        <h2>Historial</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Test</th><th class="num">✓</th><th class="num">✗</th><th class="num">○</th><th class="num">Tiempo</th><th class="num">Nota</th><th></th></tr></thead>
          <tbody>${attempts.slice().reverse().map(a => {
            const r = score(a.items);
            return `<tr class="clickable" data-open="${esc(a.id)}"><td class="small">${fmtDate(a.date)}</td><td>${esc(a.title)}</td>
              <td class="num">${r.correct}</td><td class="num">${r.wrong}</td><td class="num">${r.blank}</td><td class="num">${fmtTime(a.duration)}</td>
              <td class="num"><b>${fmt(r.grade)}</b></td><td class="num"><button class="btn sm danger" data-del="${esc(a.id)}" title="Borrar">✕</button></td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;

    $$('[data-open]').forEach(tr => tr.onclick = e => {
      if (e.target.closest('[data-del]')) return;
      location.hash = '#/result/' + tr.dataset.open;
    });
    $$('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm('¿Borrar este resultado?')) return;
      store.deleteAttempt(b.dataset.del);
      renderStats(root);
    });
    $('#drill') && ($('#drill').onclick = () => {
      const qs = Object.entries(hist).filter(([, h]) => h.ko || h.blank).map(([id]) => qById.get(id))
        .filter(q => q && !q.annulled && Number.isInteger(q.answer));
      startSession({ title: 'Repaso de falladas', kind: 'random', mode: 'practice', minutes: 0, questions: qs.sort(() => Math.random() - 0.5) });
    });

    drawCharts({ s, blockRows, attempts });
  };

  const drawCharts = ({ s, blockRows, attempts }) => {
    if (!window.Chart) { setTimeout(() => drawCharts({ s, blockRows, attempts }), 200); return; }
    const C = window.Chart;
    C.defaults.color = css('--text-2');
    C.defaults.borderColor = css('--border');
    C.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const surface = css('--surface');
    const good = css('--good'), bad = css('--bad'), blank = css('--blank');
    const pctLabel = (v, total) => `${v} (${pct(v, total)} %)`;

    charts.push(new C($('#cPie'), {
      type: 'pie',
      data: {
        labels: ['Aciertos', 'Fallos', 'En blanco'],
        datasets: [{ data: [s.correct, s.wrong, s.blank], backgroundColor: [good, bad, blank], borderColor: surface, borderWidth: 2 }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: window.innerWidth < 600 ? 'bottom' : 'right', labels: { boxWidth: 12, generateLabels: ch => C.overrides.pie.plugins.legend.labels.generateLabels(ch).map((l, i) => ({ ...l, text: `${l.text}: ${pctLabel(ch.data.datasets[0].data[i], s.total)}` })) } },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${pctLabel(c.raw, s.total)}` } },
        },
      },
    }));

    const fails = blockRows.filter(r => r.wrong);
    const totalFails = fails.reduce((a, r) => a + r.wrong, 0);
    charts.push(new C($('#cFailBlock'), {
      type: 'doughnut',
      data: {
        labels: fails.map(r => r.name),
        datasets: [{ data: fails.map(r => r.wrong), backgroundColor: fails.map(r => r.color), borderColor: surface, borderWidth: 2 }],
      },
      options: {
        maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: { position: 'bottom', align: 'start', labels: { boxWidth: 12, generateLabels: ch => C.overrides.doughnut.plugins.legend.labels.generateLabels(ch).map((l, i) => ({ ...l, text: `${l.text}: ${pct(fails[i].wrong, totalFails)} %` })) } },
          tooltip: { callbacks: { label: c => ` ${c.raw} fallos (${pct(c.raw, totalFails)} % del total)` } },
        },
      },
    }));

    const pctOf = (r, k) => (r.total ? (r[k] / r.total) * 100 : 0);
    charts.push(new C($('#cBlocks'), {
      type: 'bar',
      data: {
        labels: blockRows.map(r => r.name),
        datasets: [
          { label: 'Aciertos', data: blockRows.map(r => pctOf(r, 'correct')), backgroundColor: good, raw: blockRows.map(r => r.correct) },
          { label: 'Fallos', data: blockRows.map(r => pctOf(r, 'wrong')), backgroundColor: bad, raw: blockRows.map(r => r.wrong) },
          { label: 'En blanco', data: blockRows.map(r => pctOf(r, 'blank')), backgroundColor: blank, raw: blockRows.map(r => r.blank) },
        ].map(d => ({ ...d, borderColor: surface, borderWidth: { right: 2 }, borderSkipped: false, barThickness: 22 })),
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        scales: {
          x: { stacked: true, max: 100, ticks: { callback: v => v + ' %' }, grid: { color: css('--surface-2') } },
          y: { stacked: true, grid: { display: false }, ticks: { callback: function (v) { const l = this.getLabelForValue(v); const max = window.innerWidth < 600 ? 14 : 40; return l.length > max ? l.slice(0, max - 1) + '…' : l; } } },
        },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.dataset.raw[c.dataIndex]} (${Math.round(c.raw)} %)` } },
        },
      },
    }));

    if (attempts.length > 1) {
      const grades = attempts.map(a => score(a.items).grade);
      charts.push(new C($('#cLine'), {
        type: 'line',
        data: {
          labels: attempts.map(a => new Date(a.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })),
          datasets: [{
            label: 'Nota', data: grades, borderColor: css('--accent'), backgroundColor: css('--accent'),
            borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.2,
          }],
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: { y: { suggestedMin: 0, suggestedMax: 10, grid: { color: css('--surface-2') } }, x: { grid: { display: false } } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: c => attempts[c[0].dataIndex].title, label: c => ` Nota: ${fmt(c.raw)} · ${fmtDate(attempts[c.dataIndex].date)}` } },
          },
        },
      }));
    }
  };

  $('#fp').onchange = draw;
  $('#fk').onchange = draw;
  draw();
  return () => charts.forEach(c => c.destroy());
}
