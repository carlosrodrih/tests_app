// Puntuación: +1 por acierto, -1/3 por fallo, 0 en blanco. Nota sobre 10.
export const PENALTY = 1 / 3;

export function score(items) {
  const scored = items.filter(i => !i.annulled);
  const correct = scored.filter(i => i.chosen != null && i.chosen === i.answer).length;
  const wrong = scored.filter(i => i.chosen != null && i.chosen !== i.answer).length;
  const blank = scored.length - correct - wrong;
  const net = correct - wrong * PENALTY;
  const total = scored.length;
  return { correct, wrong, blank, total, net, grade: total ? (net / total) * 10 : 0 };
}

export const resultOf = i => (i.chosen == null ? 'blank' : i.chosen === i.answer ? 'correct' : 'wrong');

// Historial por pregunta a partir de todos los intentos: { qid: {seen, ok, ko, blank, last} }
export function questionHistory(attempts) {
  const h = {};
  for (const a of attempts) {
    for (const it of a.items) {
      if (it.annulled) continue;
      const r = (h[it.qid] ||= { seen: 0, ok: 0, ko: 0, blank: 0, last: null });
      r.seen++;
      const res = resultOf(it);
      if (res === 'correct') r.ok++; else if (res === 'wrong') r.ko++; else r.blank++;
      r.last = res;
    }
  }
  return h;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Selección aleatoria equilibrada entre bloques. Si un bloque no tiene
// preguntas suficientes, el hueco se reparte entre el resto.
// priority: 'none' | 'weak' (prioriza falladas, en blanco y no vistas)
export function pickBalanced(pool, n, { history = {}, priority = 'none' } = {}) {
  const byBlock = new Map();
  for (const q of pool) {
    const k = q.block || '_none';
    if (!byBlock.has(k)) byBlock.set(k, []);
    byBlock.get(k).push(q);
  }

  const weight = q => {
    if (priority !== 'weak') return 1;
    const r = history[q.id];
    if (!r) return 3; // nunca vista
    return Math.max(0.3, 1 + 2 * r.ko + r.blank - 0.7 * r.ok + (r.last === 'correct' ? 0 : 1.5));
  };
  // Muestreo ponderado sin reemplazo (Efraimidis–Spirakis).
  for (const [k, qs] of byBlock) {
    byBlock.set(k, qs.map(q => ({ q, key: Math.random() ** (1 / weight(q)) }))
      .sort((a, b) => b.key - a.key).map(x => x.q));
  }

  const blocks = shuffle([...byBlock.keys()]);
  const quota = new Map(blocks.map(b => [b, 0]));
  let remaining = Math.min(n, pool.length);
  // Reparto round-robin: una pregunta por bloque en cada vuelta.
  while (remaining > 0) {
    let progressed = false;
    for (const b of blocks) {
      if (remaining === 0) break;
      if (quota.get(b) < byBlock.get(b).length) {
        quota.set(b, quota.get(b) + 1);
        remaining--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return shuffle(blocks.flatMap(b => byBlock.get(b).slice(0, quota.get(b))));
}
