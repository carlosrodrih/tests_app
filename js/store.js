// Persistencia: exámenes incluidos en /data + exámenes, preguntas, bloques e
// intentos del usuario en localStorage (datos por navegador).

const K = {
  exams: 'ot.exams',
  manual: 'ot.manual',
  blocks: 'ot.blocks',
  attempts: 'ot.attempts',
  overrides: 'ot.overrides',
};

export const DEFAULT_BLOCKS = [
  { id: 'b1', name: 'Organización y marco jurídico', keywords: ['constitución', 'ley 39/2015', 'ley 40/2015', 'pleno', 'alcalde', 'concejal', 'concejales', 'trebep', 'junta de gobierno', 'ayuntamiento', 'procedimiento administrativo', 'igualdad', 'contratos', 'acuerdo marco', 'áreas de gobierno', 'estatuto'] },
  { id: 'b2', name: 'Tecnología básica y gestión TIC', keywords: ['itil', 'iso 20000', 'real decreto 311/2022', 'esquema nacional de seguridad', 'continuidad', 'vulnerabilidad', 'auditoría', 'crm', 'propiedad intelectual', 'software libre', 'payback', 'coste', 'certificado', 'certificados', 'accesibilidad', 'gpu', 'iso 55000', 'gestión documental', 'real decreto', 'business intelligence', 'smp', 'mpp'] },
  { id: 'b3', name: 'Desarrollo de sistemas', keywords: ['sql', 'java', 'javascript', 'scrum', 'métrica', 'uml', 'diagrama', 'pruebas', 'patrón', 'patrones', 'entidad', 'graphql', 'xml', 'angular', 'android', 'ios', 'aprendizaje', 'datawarehouse', 'dfd', 'historias de usuario', 'cohesión', 'lenguaje', 'modelo relacional', 'odbc', 'airflow', 'mantenimiento', 'requisitos', 'html', 'css', 'gis'] },
  { id: 'b4', name: 'Sistemas y comunicaciones', keywords: ['tcp', 'udp', 'ip', 'ipv6', 'ipv4', 'red', 'redes', 'protocolo', 'linux', 'unix', 'san', 'máquina virtual', 'contenedores', 'snmp', 'copias de seguridad', 'dwdm', 'http/3', 'tetra', 'plc', 'códec', 'mainframe', 'vlan', 'router', 'fibra', 'lan', 'wifi', '5g', 'voip', 'backup', 'raid', 'cpd'] },
];

const BLOCK_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const blockColor = i => BLOCK_COLORS[i % BLOCK_COLORS.length];

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { alert('No se pudo guardar en el navegador: ' + e.message); return false; }
}

let builtin = [];

export async function loadBuiltin() {
  try {
    const list = await (await fetch('data/exams/index.json')).json();
    builtin = await Promise.all(list.map(async f => {
      const e = await (await fetch('data/exams/' + f)).json();
      e.builtin = true;
      return e;
    }));
  } catch (e) {
    console.warn('No se pudieron cargar los exámenes incluidos', e);
    builtin = [];
  }
}

// --- Bloques ---------------------------------------------------------------
export const getBlocks = () => read(K.blocks, DEFAULT_BLOCKS);
export const saveBlocks = b => write(K.blocks, b);
export function blockName(id) {
  return getBlocks().find(b => b.id === id)?.name || 'Sin bloque';
}

// --- Exámenes y preguntas --------------------------------------------------
const qid = (examId, n) => `${examId}#${n}`;

// Los cambios de bloque/respuesta sobre preguntas de exámenes incluidos se guardan aparte.
const getOverrides = () => read(K.overrides, {});

function normalizeExam(e) {
  const ov = getOverrides();
  return {
    ...e,
    questions: e.questions.map(q => {
      const id = qid(e.id, q.number);
      return { ...q, ...(ov[id] || {}), id, examId: e.id, examName: e.name };
    }),
  };
}

export function getExams() {
  return [...builtin, ...read(K.exams, [])].map(normalizeExam);
}
export function getExam(id) {
  return getExams().find(e => e.id === id);
}
export function saveExam(exam) {
  const list = read(K.exams, []).filter(e => e.id !== exam.id);
  list.push(exam);
  return write(K.exams, list);
}
export function deleteExam(id) {
  write(K.exams, read(K.exams, []).filter(e => e.id !== id));
}

export function getManualQuestions() {
  return read(K.manual, []).map(q => ({ ...q, examId: null, examName: 'Preguntas sueltas' }));
}
export function saveManualQuestion(q) {
  const list = read(K.manual, []);
  const i = list.findIndex(x => x.id === q.id);
  if (i >= 0) list[i] = q; else list.push(q);
  return write(K.manual, list);
}
export function deleteManualQuestion(id) {
  write(K.manual, read(K.manual, []).filter(q => q.id !== id));
}

export function allQuestions() {
  return [...getExams().flatMap(e => e.questions), ...getManualQuestions()];
}

// Editar una pregunta de cualquier origen (bloque, respuesta, anulada...).
export function updateQuestion(q, changes) {
  if (!q.examId) return saveManualQuestion({ ...stripMeta(q), ...changes });
  const own = read(K.exams, []);
  const exam = own.find(e => e.id === q.examId);
  if (exam) {
    const target = exam.questions.find(x => x.number === q.number);
    Object.assign(target, changes);
    return write(K.exams, own);
  }
  const ov = getOverrides();
  ov[q.id] = { ...(ov[q.id] || {}), ...changes };
  return write(K.overrides, ov);
}
function stripMeta(q) {
  const { examId, examName, ...rest } = q;
  return rest;
}

// --- Intentos --------------------------------------------------------------
export const getAttempts = () => read(K.attempts, []);
export function saveAttempt(a) {
  const list = getAttempts();
  list.push(a);
  return write(K.attempts, list);
}
export function deleteAttempt(id) {
  write(K.attempts, getAttempts().filter(a => a.id !== id));
}
export function clearAttempts() { write(K.attempts, []); }

// --- Copia de seguridad ----------------------------------------------------
export function exportAll() {
  const out = { app: 'oposi-test', version: 1, exportedAt: new Date().toISOString() };
  for (const [name, key] of Object.entries(K)) out[name] = read(key, null);
  return out;
}
export function importAll(data) {
  if (!data || data.app !== 'oposi-test') throw new Error('El archivo no es una copia de esta aplicación.');
  for (const [name, key] of Object.entries(K)) if (data[name] != null) write(key, data[name]);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
