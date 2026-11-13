// Gera puzzles com solução ÚNICA (verificada), com semente fixa.
// Uso: node tools/gen_puzzles.js [semente] [arquivo_de_saida] [puzzles_por_nivel]
// Padrão: semente 20261111, saída js/puzzles.js, 5 puzzles por nível.
const fs = require('fs');
const path = require('path');
const { createCore } = require('../js/core.js');
const core = createCore();

const PER_TIER = +process.argv[4] || 5;
const SEED = +process.argv[2] || 20261111;
const rnd = core.mulberry32(SEED);

const TIERS = [
  { key: 'facil',         label: 'Fácil',         clues: 38, exact: true,  needSingles: true  },
  { key: 'medio',         label: 'Médio',         clues: 32, exact: true,  needSingles: null  },
  { key: 'dificil',       label: 'Difícil',       clues: 27, exact: true,  needSingles: false },
  { key: 'muito_dificil', label: 'Muito difícil', clues: 24, exact: false, needSingles: false } // <= 24 pistas
];

function fullGrid() {
  const empty = new Uint8Array(81);
  return core.solveExact(empty, 1, rnd, 0).solution;
}

function makePuzzle(target, exact) {
  const grid = fullGrid();
  const p = Uint8Array.from(grid);
  const order = core.shuffleInPlace([...Array(81).keys()], rnd);
  let clues = 81;
  for (const idx of order) {
    if (clues <= target) break;
    const keep = p[idx];
    p[idx] = 0;
    if (core.solveExact(p, 2, null, 0).count !== 1) p[idx] = keep; else clues--;
  }
  if (exact ? clues !== target : clues > target) return null;
  return { grid: p, clues };
}

const out = {};
const report = [];
for (const t of TIERS) {
  out[t.key] = [];
  let tries = 0;
  while (out[t.key].length < PER_TIER && tries < 20000) {
    tries++;
    const pz = makePuzzle(t.clues, t.exact);
    if (!pz) continue;
    const singles = core.solvableBySingles(pz.grid);
    if (t.needSingles === true && !singles) continue;
    if (t.needSingles === false && singles) continue;
    const u = core.solveExact(pz.grid, 2, null, 0);
    if (u.count !== 1) throw new Error('puzzle não único (bug)');
    out[t.key].push({
      id: t.key + '-' + (out[t.key].length + 1),
      grid: Array.from(pz.grid).join(''),
      clues: pz.clues,
      singles,
      nodes: u.nodes
    });
  }
  report.push(`${t.label}: ${out[t.key].length} puzzles em ${tries} tentativas`);
}

const meta = {};
for (const t of TIERS) meta[t.key] = { label: t.label };
const js = '/* Gerado por tools/gen_puzzles.js (semente ' + SEED + '). Todos têm solução única. */\n' +
  'var SUDOKU_TIERS = ' + JSON.stringify(meta) + ';\n' +
  'var SUDOKU_PUZZLES = ' + JSON.stringify(out, null, 1) + ';\n' +
  "if (typeof module !== 'undefined' && module.exports) module.exports = { SUDOKU_TIERS: SUDOKU_TIERS, SUDOKU_PUZZLES: SUDOKU_PUZZLES };\n";
fs.writeFileSync(process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..', 'js', 'puzzles.js'), js);
console.log(report.join('\n'));
for (const t of TIERS) {
  const arr = out[t.key];
  console.log(t.label.padEnd(14), 'pistas:', arr.map(a => a.clues).join(','), '| singles:', arr.map(a => a.singles ? 'S' : 'N').join(''), '| nós:', arr.map(a => a.nodes).join(','));
}
