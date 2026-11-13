// Calibração em conjunto SEPARADO de puzzles (tools/tuning_puzzles.js, semente 777),
// para não ajustar parâmetros nos mesmos puzzles usados nos experimentos.
// Uso: node tools/tune.js '<json: lista de {name, method, params}>' [execucoes] [limite]
// Ex.:  node tools/tune.js '[{"name":"ag folga3","method":"ag","params":{"slack":3}}]' 6 100000
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { createCore } = require('../js/core.js');
if (isMainThread) {
  const { SUDOKU_PUZZLES } = require('./tuning_puzzles.js');
  const configs = JSON.parse(process.argv[2]);
  const runs = +process.argv[3] || 6, cap = +process.argv[4] || 100000;
  const jobs = [];
  configs.forEach((cfg, ci) => Object.keys(SUDOKU_PUZZLES).forEach(t => SUDOKU_PUZZLES[t].forEach(p => {
    for (let r = 0; r < runs; r++) jobs.push({ ci, t, grid: p.grid, seed: 5000 + r });
  })));
  const stats = configs.map(() => ({}));
  let next = 0, done = 0;
  const W = Math.max(1, os.cpus().length);
  for (let w = 0; w < W; w++) {
    const wk = new Worker(__filename, { workerData: { configs, cap } });
    const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.terminate(); };
    wk.on('message', (m) => {
      const s = stats[m.ci][m.t] || (stats[m.ci][m.t] = { n: 0, ok: 0, evs: [], ms: 0 });
      s.n++; s.ms += m.ms; if (m.solved) { s.ok++; s.evs.push(m.evals); }
      if (++done === jobs.length) report();
      feed();
    });
    feed();
  }
  function report() {
    configs.forEach((cfg, ci) => {
      const cells = Object.keys(stats[ci]).map(t => {
        const s = stats[ci][t]; s.evs.sort((a, b) => a - b);
        const med = s.evs.length ? s.evs[Math.floor(s.evs.length / 2)] : '-';
        return t.slice(0, 4) + ' ' + (100 * s.ok / s.n).toFixed(0).padStart(3) + '% (med ' + String(med).padStart(6) + ')';
      });
      console.log(cfg.name.padEnd(34), cells.join(' | '));
    });
  }
} else {
  const core = createCore();
  const { configs, cap } = workerData;
  parentPort.on('message', (j) => {
    const cfg = configs[j.ci];
    const r = core.run(cfg.method, core.parsePuzzle(j.grid), j.seed, cap, cfg.params || {});
    parentPort.postMessage({ ci: j.ci, t: j.t, solved: r.solved, evals: r.evals, ms: r.ms });
  });
}
