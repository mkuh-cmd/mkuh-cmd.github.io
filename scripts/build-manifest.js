#!/usr/bin/env node
/*
 * Regenerates ssa-math-hub-manifest.json from a local clone of the
 * mkuh-cmd/ssa-math-resources repo. The Math Hub's textbook pages
 * (textbook-7th-standard.html, textbook-7th-accelerated.html,
 * textbook-ramp6.html) already embed each course's unit/lesson data
 * as plain JS objects — this script extracts those objects directly
 * from the source files and cross-checks every resulting resource
 * path (Slide/Student/Teacher/Practice/Key) against the actual files
 * on disk, so the manifest can never point at a file that doesn't
 * exist.
 *
 * Usage:
 *   git clone https://github.com/mkuh-cmd/ssa-math-resources ../ssa-math-resources
 *   node scripts/build-manifest.js [path-to-ssa-math-resources-clone]
 *
 * Re-run this whenever units/lessons are added to the Math Hub, then
 * commit the updated ssa-math-hub-manifest.json.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = process.argv[2] || path.join(__dirname, '..', '..', 'ssa-math-resources');
const OUT_PATH = path.join(__dirname, '..', 'ssa-math-hub-manifest.json');

if (!fs.existsSync(REPO)) {
  console.error('Could not find a local clone of ssa-math-resources at: ' + REPO);
  console.error('Clone it first, e.g.:');
  console.error('  git clone https://github.com/mkuh-cmd/ssa-math-resources ../ssa-math-resources');
  console.error('...or pass its path explicitly: node scripts/build-manifest.js /path/to/ssa-math-resources');
  process.exit(1);
}

function extractDecl(src, name) {
  const re = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*');
  const m = re.exec(src);
  if (!m) throw new Error('declaration not found: ' + name);
  let i = m.index + m[0].length;
  const start = i;
  const open = src[i];
  if (open === '"' || open === "'" || open === '`') {
    i++;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === open) { i++; break; }
      i++;
    }
  } else if (open === '{' || open === '[') {
    let depth = 0, inStr = null;
    while (i < src.length) {
      const c = src[i];
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === inStr) inStr = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    throw new Error('unsupported literal start for ' + name + ': ' + open);
  }
  return 'const ' + name + ' = ' + src.slice(start, i) + ';';
}

function fileExists(relUrlEncoded) {
  if (!relUrlEncoded) return false;
  const relDecoded = decodeURIComponent(relUrlEncoded);
  const full = path.join(REPO, relDecoded);
  return fs.existsSync(full);
}

function resOrNull(rel) {
  return fileExists(rel) ? rel : null;
}

function runDecls(src, names) {
  const script = names.map(n => extractDecl(src, n)).join('\n') + '\nglobalThis.__out = { ' + names.join(', ') + ' };';
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox.__out;
}

const manifest = { generatedAt: new Date().toISOString(), subjects: [] };
const e = encodeURIComponent;

// ---------- 7th Grade Standard ----------
(function () {
  const src = fs.readFileSync(path.join(REPO, 'textbook-7th-standard.html'), 'utf8');
  const { UNIT_NAMES, LESSON_NAMES, unitLessons, BASE } = runDecls(src, ['UNIT_NAMES', 'LESSON_NAMES', 'unitLessons', 'BASE']);
  const lessons = [];
  Object.keys(unitLessons).map(Number).sort((a, b) => a - b).forEach(u => {
    const count = unitLessons[u];
    for (let l = 1; l <= count; l++) {
      const key = `${u}.${l}`;
      const name = LESSON_NAMES[key];
      if (!name) continue;
      const slidePath = `${BASE}/${e('1. Presentation Slide')}/${e('Unit ' + u)}/${e('Unit ' + u + '.' + l + '.pptx')}`;
      if (!fileExists(slidePath)) { console.warn('MISSING slide (7th std):', decodeURIComponent(slidePath)); continue; }
      const studentPath = `${BASE}/${e('2. Student Pages')}/${e('Unit ' + u)}/${e('Unit ' + u + '.' + l + '.pdf')}`;
      const teacherPath = u === 9
        ? `${BASE}/${e('3. Teacher Pages')}/${e('Unit ' + u)}/${e('Unit ' + u + '.' + l + '.pdf')}`
        : `${BASE}/${e('3. Teacher Pages')}/${e('Unit ' + u)}/${e('Lesson ' + u + '.' + l + ' [T].pdf')}`;
      const blankPath = `${BASE}/${e('4. Practice Page')}/${e('Blank')}/${e('Unit ' + u)}/${e('Lesson ' + u + '.' + l + ' [P].pdf')}`;
      const keyPath = `${BASE}/${e('4. Practice Page')}/${e('Key')}/${e('Unit ' + u)}/${e('Lesson ' + u + '.' + l + ' [P.K].pdf')}`;
      lessons.push({
        unit: u, unitName: UNIT_NAMES[u] || ('Unit ' + u), ref: key, name,
        slidePath, studentPath: resOrNull(studentPath), teacherPath: resOrNull(teacherPath),
        blankPath: resOrNull(blankPath), keyPath: resOrNull(keyPath)
      });
    }
  });
  manifest.subjects.push({ id: '7th-standard', label: '7th Grade Standard', lessons });
})();

// ---------- 7th Grade Accelerated ----------
(function () {
  const src = fs.readFileSync(path.join(REPO, 'textbook-7th-accelerated.html'), 'utf8');
  const names = ['R6_SLIDE', 'R6_STUDENT', 'R6_TEACHER', 'R6_BLANK', 'R6_KEY',
    'A7_SLIDE', 'A7_STUDENT', 'A7_TEACHER', 'A7_BLANK', 'A7_KEY', 'UNITS_Q1'];
  const out = runDecls(src, names);
  const lessons = [];
  out.UNITS_Q1.forEach(unit => {
    const qf = e(unit.qFolder);
    const p = unit.paths;
    unit.lessons.forEach(L => {
      const slidePath = `${p.slide}/${qf}/${e(L.slideFile)}`;
      if (!fileExists(slidePath)) { console.warn('MISSING slide (7th accel):', decodeURIComponent(slidePath)); return; }
      const studentPath = `${p.student}/${qf}/${e(L.ref + '.pdf')}`;
      const teacherPath = `${p.teacher}/${qf}/${e(L.ref + '.pdf')}`;
      const blankPath = `${p.blank}/${qf}/${e(L.ref + '.pdf')}`;
      const keyPath = `${p.key}/${qf}/${e(L.ref + '.pdf')}`;
      lessons.push({
        unit: unit.num, unitName: unit.title, ref: L.ref, name: L.name,
        slidePath, studentPath: resOrNull(studentPath), teacherPath: resOrNull(teacherPath),
        blankPath: resOrNull(blankPath), keyPath: resOrNull(keyPath)
      });
    });
  });
  manifest.subjects.push({ id: '7th-accelerated', label: '7th Grade Accelerated', lessons });
})();

// ---------- RAMP 6 ----------
(function () {
  const src = fs.readFileSync(path.join(REPO, 'textbook-ramp6.html'), 'utf8');
  const { q1Units, SLIDE_BASE, STUDENT_BASE, TEACHER_BASE, BLANK_BASE, KEY_BASE } =
    runDecls(src, ['q1Units', 'SLIDE_BASE', 'STUDENT_BASE', 'TEACHER_BASE', 'BLANK_BASE', 'KEY_BASE']);
  const lessons = [];
  const qf = e('Quarter 1');
  q1Units.forEach(unit => {
    unit.lessons.forEach(L => {
      const slidePath = `${SLIDE_BASE}/${qf}/${e(L.slideFile)}`;
      if (!fileExists(slidePath)) { console.warn('MISSING slide (ramp6):', decodeURIComponent(slidePath)); return; }
      const studentPath = `${STUDENT_BASE}/${qf}/${e(L.ref + '.pdf')}`;
      const teacherPath = `${TEACHER_BASE}/${qf}/${e(L.ref + '.pdf')}`;
      const blankPath = `${BLANK_BASE}/${qf}/${e(L.ref + '.pdf')}`;
      const keyPath = `${KEY_BASE}/${qf}/${e(L.ref + '.pdf')}`;
      lessons.push({
        unit: unit.unitNum, unitName: unit.title, ref: L.ref, name: L.name,
        slidePath, studentPath: resOrNull(studentPath), teacherPath: resOrNull(teacherPath),
        blankPath: resOrNull(blankPath), keyPath: resOrNull(keyPath)
      });
    });
  });
  manifest.subjects.push({ id: 'ramp6', label: 'RAMP 6', lessons });
})();

// stable order index per subject (used for default pacing and the
// Pacing Guide <-> Slides Generator handoff)
manifest.subjects.forEach(s => { s.lessons.forEach((l, i) => { l.order = i; }); });

// ---------- validation: fail loudly on data that would silently break the UI ----------
(function validate() {
  let failed = false;
  manifest.subjects.forEach(s => {
    if (!s.lessons.length) {
      console.error('VALIDATION FAILED: subject "' + s.id + '" has zero lessons.');
      failed = true;
    }
    const seenRefs = new Map();
    s.lessons.forEach(l => {
      if (!l.name || !l.name.trim()) {
        console.error('VALIDATION FAILED: ' + s.id + ' ' + l.ref + ' has an empty lesson name.');
        failed = true;
      }
      if (!l.slidePath) {
        console.error('VALIDATION FAILED: ' + s.id + ' ' + l.ref + ' has no slidePath.');
        failed = true;
      }
      const dupeKey = l.unit + '::' + l.ref;
      if (seenRefs.has(dupeKey)) {
        console.error('VALIDATION FAILED: ' + s.id + ' has a duplicate lesson ref "' + l.ref + '" within unit "' + l.unit + '".');
        failed = true;
      }
      seenRefs.set(dupeKey, true);
    });
  });
  if (failed) {
    console.error('\nRefusing to write ' + OUT_PATH + ' — fix the issues above (usually in the source textbook-*.html data) and re-run.');
    process.exit(1);
  }
})();

manifest.subjects.forEach(s => {
  const withStudent = s.lessons.filter(l => l.studentPath).length;
  const withTeacher = s.lessons.filter(l => l.teacherPath).length;
  const withBlank = s.lessons.filter(l => l.blankPath).length;
  const withKey = s.lessons.filter(l => l.keyPath).length;
  console.log(s.label, '->', s.lessons.length, 'lessons | student:', withStudent, 'teacher:', withTeacher, 'blank:', withBlank, 'key:', withKey);
});
fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote', OUT_PATH);
