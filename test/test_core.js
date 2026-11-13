// Testes de invariantes do núcleo. Uso: node test/test_core.js
const assert = require('assert');
const { createCore } = require('../js/core.js');
const { SUDOKU_PUZZLES } = require('../js/puzzles.js');
const core = createCore();

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ', name); }

function isValidSolution(solStr, cluesStr) {
  const g = Array.from(solStr, Number);
  for (let i = 0; i < 81; i++) if (+cluesStr[i] && g[i] !== +cluesStr[i]) return false;
  for (let u = 0; u < 9; u++) {
    const r = new Set(), c = new Set(), b = new Set();
    for (let k = 0; k < 9; k++) {
      r.add(g[u * 9 + k]); c.add(g[k * 9 + u]);
      b.add(g[(Math.floor(u / 3) * 3 + Math.floor(k / 3)) * 9 + (u % 3) * 3 + (k % 3)]);
    }
    if (r.size !== 9 || c.size !== 9 || b.size !== 9) return false;
  }
  return true;
}

const all = Object.values(SUDOKU_PUZZLES).flat();

test('puzzles gerados: pistas consistentes e solução única', () => {
  for (const p of all) {
    const clues = core.parsePuzzle(p.grid);
    assert.strictEqual(core.validateClues(clues), null);
    assert.strictEqual(core.solveExact(clues, 2, null, 0).count, 1, p.id);
    assert.strictEqual(clues.filter(Boolean).length, p.clues);
  }
});

test('inicialização: blocos são permutações de 1..9 e pistas ficam fixas', () => {
  const rnd = core.mulberry32(7);
  for (const p of all) {
    const clues = core.parsePuzzle(p.grid), ctx = core.makeContext(clues), g = new Uint8Array(81);
    for (let rep = 0; rep < 20; rep++) {
      core.randomInit(ctx, rnd, g);
      for (let i = 0; i < 81; i++) if (clues[i]) assert.strictEqual(g[i], clues[i]);
      for (const blk of ctx.blocks) assert.deepStrictEqual(blk.cells.map(i => g[i]).sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  }
});

test('swapDelta bate com a aptidão recalculada do zero (e desfaz corretamente)', () => {
  const rnd = core.mulberry32(11);
  for (const p of all) {
    const clues = core.parsePuzzle(p.grid), ctx = core.makeContext(clues), g = new Uint8Array(81);
    core.randomInit(ctx, rnd, g);
    for (let rep = 0; rep < 300; rep++) {
      const blk = ctx.blocks[ctx.swappable[Math.floor(rnd() * ctx.swappable.length)]].free;
      const a = blk[Math.floor(rnd() * blk.length)];
      const b = blk[Math.floor(rnd() * blk.length)];
      if (a === b) continue;
      const f0 = core.fullCost(g);
      const d = core.swapDelta(g, a, b);
      assert.strictEqual(core.fullCost(g), f0 + d);
      if (rnd() < 0.5) { core.swapDelta(g, a, b); assert.strictEqual(core.fullCost(g), f0); }
    }
  }
});

test('mutação e cruzamento preservam blocos e pistas (mutação livre e literal)', () => {
  const rnd = core.mulberry32(5);
  for (const mutFree of [true, false]) {
    for (const p of all) {
      const clues = core.parsePuzzle(p.grid), ctx = core.makeContext(clues);
      const a = new Uint8Array(81), b = new Uint8Array(81), c = new Uint8Array(81);
      const P = Object.assign({}, core.DEFAULTS, { mutFree });
      for (let rep = 0; rep < 50; rep++) {
        core.randomInit(ctx, rnd, a); core.randomInit(ctx, rnd, b);
        core.crossoverBlocks(ctx, a, b, rnd, c);
        core.mutateArticle(ctx, c, rnd, P);
        for (let i = 0; i < 81; i++) if (clues[i]) assert.strictEqual(c[i], clues[i]);
        for (const blk of ctx.blocks) assert.deepStrictEqual(blk.cells.map(i => c[i]).sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      }
    }
  }
});

test('aptidão zero <=> solução válida (grade resolvida pelo solver)', () => {
  for (const p of all) {
    const clues = core.parsePuzzle(p.grid);
    const sol = core.solveExact(clues, 1, null, 0).solution;
    assert.strictEqual(core.fullCost(sol), 0);
    assert.ok(isValidSolution(Array.from(sol).join(''), p.grid));
  }
});

test('todos os métodos: resultado coerente (solução reportada confere com a aptidão)', () => {
  const p = SUDOKU_PUZZLES.facil[0], clues = core.parsePuzzle(p.grid);
  for (const m of ['ag', 'ag_sem_cruz', 'sa', 'ag_mem', 'bt']) {
    const r = core.run(m, clues, 123, 50000, {});
    if (r.solved) assert.ok(isValidSolution(r.solution, p.grid), m);
    else assert.ok(r.bestF > 0, m);
    if (m !== 'bt') {
      assert.ok(r.evals <= 50000, m + ' passou do limite');
      assert.strictEqual(r.trace.length, core.DEFAULTS.tracePoints);
      assert.strictEqual(core.fullCost(Uint8Array.from(r.solution, Number)) === 0, r.solved);
    }
  }
});

test('reprodutibilidade: mesma semente => mesmo resultado', () => {
  const clues = core.parsePuzzle(SUDOKU_PUZZLES.medio[1].grid);
  for (const m of ['ag', 'ag_sem_cruz', 'sa', 'ag_mem']) {
    const a = core.run(m, clues, 99, 20000, {}), b = core.run(m, clues, 99, 20000, {});
    assert.strictEqual(a.evals, b.evals); assert.strictEqual(a.bestF, b.bestF); assert.strictEqual(a.solution, b.solution);
  }
});

test('limite de avaliações é respeitado e traço é monótono', () => {
  const clues = core.parsePuzzle(SUDOKU_PUZZLES.muito_dificil[3].grid);
  for (const m of ['ag', 'ag_sem_cruz', 'sa', 'ag_mem']) {
    const r = core.run(m, clues, 3, 3000, {});
    assert.ok(r.evals <= 3000);
    for (let i = 1; i < r.trace.length; i++) assert.ok(r.trace[i] <= r.trace[i - 1]);
  }
});

test('solvableBySingles: fácil sim, difícil não', () => {
  assert.ok(SUDOKU_PUZZLES.facil.every(p => core.solvableBySingles(core.parsePuzzle(p.grid))));
  assert.ok(SUDOKU_PUZZLES.dificil.every(p => !core.solvableBySingles(core.parsePuzzle(p.grid))));
});

test('Mann-Whitney: casos conhecidos', () => {
  const S = require('../js/stats.js');
  const t = S.mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
  assert.ok(t.p < 0.02 && t.a12 === 1);
  const same = S.mannWhitney([5, 5, 5], [5, 5, 5]);
  assert.strictEqual(same.p, 1);
  assert.ok(Math.abs(S.erfc(0) - 1) < 1e-12 && Math.abs(S.erfc(1) - 0.15729920705028513) < 1e-10);
});

console.log('\n' + passed + ' testes passaram');
