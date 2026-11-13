/*
 * Núcleo dos algoritmos: roda em Node (testes) e dentro de Web Workers.
 *
 * IMPORTANTE: createCore() precisa ser autocontida (sem referências a variáveis
 * externas), porque a página monta o código do worker a partir de
 * createCore.toString().
 *
 * Representação (a mesma do artigo de Mantere e Koljonen, 2007):
 *   - indivíduo = vetor de 81 inteiros (1..9), 9 sub-blocos 3x3;
 *   - as pistas ficam fixas e cada sub-bloco é sempre uma permutação de 1..9;
 *   - aptidão (minimizar): para cada linha e coluna, 2 por dígito ausente
 *     (cada ausente custa 1 e cada repetição custa 1). Aptidão 0 = solução.
 *
 * Unidade de esforço: 1 "avaliação" = 1 solução candidata avaliada
 * (completa, no AG; vizinha, no SA e na busca local).
 */
function createCore() {
  'use strict';

  // ---------- utilidades ----------
  var POP = new Uint8Array(1024);
  for (var pi = 1; pi < 1024; pi++) POP[pi] = POP[pi >> 1] + (pi & 1);

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function shuffleInPlace(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- puzzles ----------
  function parsePuzzle(str) {
    var s = String(str).replace(/\s+/g, '');
    if (s.length !== 81) throw new Error('O puzzle precisa ter 81 caracteres (tem ' + s.length + ').');
    var g = new Uint8Array(81);
    for (var i = 0; i < 81; i++) {
      var ch = s[i];
      if (ch >= '1' && ch <= '9') g[i] = ch.charCodeAt(0) - 48;
      else if (ch === '0' || ch === '.' || ch === '_' || ch === '-') g[i] = 0;
      else throw new Error('Caractere inválido "' + ch + '" na posição ' + (i + 1) + '.');
    }
    return g;
  }

  // devolve null se as pistas são consistentes, ou uma mensagem de erro
  function validateClues(clues) {
    for (var u = 0; u < 9; u++) {
      var r = 0, c = 0, b = 0;
      for (var k = 0; k < 9; k++) {
        var vr = clues[u * 9 + k], vc = clues[k * 9 + u];
        var bi = (Math.floor(u / 3) * 3 + Math.floor(k / 3)) * 9 + (u % 3) * 3 + (k % 3);
        var vb = clues[bi];
        if (vr) { if (r & (1 << vr)) return 'Pista repetida na linha ' + (u + 1) + '.'; r |= 1 << vr; }
        if (vc) { if (c & (1 << vc)) return 'Pista repetida na coluna ' + (u + 1) + '.'; c |= 1 << vc; }
        if (vb) { if (b & (1 << vb)) return 'Pista repetida no bloco ' + (u + 1) + '.'; b |= 1 << vb; }
      }
    }
    return null;
  }

  function makeContext(clues) {
    var fixed = new Uint8Array(81);
    for (var i = 0; i < 81; i++) fixed[i] = clues[i] ? 1 : 0;
    var blocks = [];
    for (var b = 0; b < 9; b++) {
      var br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      var cells = [], free = [], present = 0;
      for (var dr = 0; dr < 3; dr++) for (var dc = 0; dc < 3; dc++) {
        var idx = (br + dr) * 9 + bc + dc;
        cells.push(idx);
        if (clues[idx]) present |= 1 << clues[idx]; else free.push(idx);
      }
      var missing = [];
      for (var d = 1; d <= 9; d++) if (!((present >> d) & 1)) missing.push(d);
      blocks.push({ cells: cells, free: free, missing: missing });
    }
    var swappable = [];
    for (var bb = 0; bb < 9; bb++) if (blocks[bb].free.length >= 2) swappable.push(bb);
    return { clues: clues, fixed: fixed, blocks: blocks, swappable: swappable };
  }

  // ---------- aptidão ----------
  function rowCost(g, r) {
    var m = 0, o = r * 9;
    for (var j = 0; j < 9; j++) m |= 1 << g[o + j];
    return 2 * (9 - POP[m]);
  }
  function colCost(g, c) {
    var m = 0;
    for (var k = 0; k < 9; k++) m |= 1 << g[k * 9 + c];
    return 2 * (9 - POP[m]);
  }
  function fullCost(g) {
    var c = 0;
    for (var u = 0; u < 9; u++) c += rowCost(g, u) + colCost(g, u);
    return c;
  }

  // Troca in-place os valores das células i e j e devolve a variação de aptidão.
  // Para desfazer, basta chamar de novo com os mesmos índices.
  function swapDelta(g, i, j) {
    var ri = (i / 9) | 0, rj = (j / 9) | 0, ci = i % 9, cj = j % 9;
    var doRows = ri !== rj, doCols = ci !== cj;
    var before = 0, after = 0;
    if (doRows) before += rowCost(g, ri) + rowCost(g, rj);
    if (doCols) before += colCost(g, ci) + colCost(g, cj);
    var t = g[i]; g[i] = g[j]; g[j] = t;
    if (doRows) after += rowCost(g, ri) + rowCost(g, rj);
    if (doCols) after += colCost(g, ci) + colCost(g, cj);
    return after - before;
  }

  // ocorrências do dígito d na linha + na coluna da célula idx. A própria célula é contada
  // nas duas, então o mínimo é 2 (nenhum conflito); "folga 3" admite uma ocorrência extra.
  function occurrences(g, idx, d) {
    var r = (idx / 9) | 0, c = idx % 9, n = 0, k;
    for (k = 0; k < 9; k++) { if (g[r * 9 + k] === d) n++; if (g[k * 9 + c] === d) n++; }
    return n;
  }

  // ---------- operadores ----------
  function randomInit(ctx, rnd, g) {
    g.set(ctx.clues);
    for (var b = 0; b < 9; b++) {
      var blk = ctx.blocks[b];
      var perm = shuffleInPlace(blk.missing.slice(), rnd);
      for (var k = 0; k < blk.free.length; k++) g[blk.free[k]] = perm[k];
    }
  }

  // Mutação como descrita no artigo: sequência de 1..maxSwaps trocas dentro de sub-blocos.
  // Se a troca tocar uma pista, a sequência é interrompida; com "folga", a troca só é
  // aceita se os dois dígitos movidos ficarem com no máximo `slack` ocorrências somadas na
  // linha e na coluna de destino (a própria célula conta nas duas; ver occurrences()).
  // Interpretação operacional do texto do artigo, calibrada em puzzles separados.
  function mutateArticle(ctx, g, rnd, P) {
    var k = 1 + Math.floor(rnd() * P.maxSwaps);
    for (var s = 0; s < k; s++) {
      var a, c;
      if (P.mutFree) {
        // sorteia as duas posições entre as células livres de um sub-bloco
        if (ctx.swappable.length === 0) return;
        var fr = ctx.blocks[ctx.swappable[Math.floor(rnd() * ctx.swappable.length)]].free;
        var ia = Math.floor(rnd() * fr.length), ib = Math.floor(rnd() * (fr.length - 1));
        if (ib >= ia) ib++;
        a = fr[ia]; c = fr[ib];
      } else {
        // leitura literal: sorteia entre as 9 células; se tocar uma pista, interrompe a sequência
        var cells = ctx.blocks[Math.floor(rnd() * 9)].cells;
        a = cells[Math.floor(rnd() * 9)];
        c = cells[Math.floor(rnd() * 9)];
        if (a === c) continue;
        if (ctx.fixed[a] || ctx.fixed[c]) break;
      }
      var t = g[a]; g[a] = g[c]; g[c] = t;
      if (P.slack > 0 && (occurrences(g, a, g[a]) > P.slack || occurrences(g, c, g[c]) > P.slack)) {
        t = g[a]; g[a] = g[c]; g[c] = t; // rejeita
      }
    }
  }

  function crossoverBlocks(ctx, a, b, rnd, out) {
    for (var blk = 0; blk < 9; blk++) {
      var src = rnd() < 0.5 ? a : b, cells = ctx.blocks[blk].cells;
      for (var k = 0; k < 9; k++) out[cells[k]] = src[cells[k]];
    }
  }

  var DEFAULTS = {
    popSize: 21,        // indivíduos
    maxSwaps: 5,        // trocas por mutação (1..maxSwaps)
    slack: 3,           // regra de folga (0 desliga)
    mutFree: true,      // mutação sorteia só entre células livres (false = leitura literal do artigo)
    restartGens: 2000,  // gerações sem solução até reiniciar a população
    aging: true,        // envelhecimento do melhor indivíduo
    lsSteps: 100,       // passos de busca local por filho (AG memético)
    lsTemp: 0,          // temperatura da busca local do memético (0 = só descida)
    saT0: 1.0,          // temperatura inicial do SA
    saAlpha: 0.99,      // fator de resfriamento
    saChain: 100,       // movimentos por temperatura
    saTmin: 0.15,       // abaixo disso, reinicia
    tracePoints: 100    // pontos da curva de convergência
  };

  var METHODS = {
    ag:           { label: 'AG (artigo)',                  cross: true,  memetic: false },
    ag_sem_cruz:  { label: 'AG sem cruzamento',            cross: false, memetic: false },
    sa:           { label: 'Simulated Annealing',          sa: true },
    ag_mem:       { label: 'AG memético (AG + busca local)', cross: true,  memetic: true },
    bt:           { label: 'Backtracking (referência exata)', exact: true }
  };

  // ---------- execução de um método ----------
  function run(method, clues, seed, cap, userParams) {
    var P = {}, key;
    for (key in DEFAULTS) P[key] = DEFAULTS[key];
    if (userParams) for (key in userParams) if (userParams[key] !== undefined && userParams[key] !== null) P[key] = userParams[key];
    if (!(clues instanceof Uint8Array)) clues = Uint8Array.from(clues);
    var def = METHODS[method];
    if (!def) throw new Error('Método desconhecido: ' + method);
    if (def.exact) return runBacktracking(clues, cap);

    var ctx = makeContext(clues);
    var rnd = mulberry32(seed);
    var t0 = now();
    var step = Math.max(1, Math.floor(cap / P.tracePoints));
    var st = { evals: 0, bestF: 1e9, bestG: new Uint8Array(81), solved: false, trace: [], nextCp: step, restarts: 0 };

    function note(g, f) {
      st.evals++;
      if (f < st.bestF) { st.bestF = f; st.bestG.set(g); }
      if (f === 0) st.solved = true;
      while (st.evals >= st.nextCp && st.trace.length < P.tracePoints) { st.trace.push(st.bestF); st.nextCp += step; }
    }
    function over() { return st.solved || st.evals >= cap; }

    if (ctx.swappable.length === 0) {
      // sem graus de liberdade: só existe um preenchimento
      var g0 = new Uint8Array(81); randomInit(ctx, rnd, g0); note(g0, fullCost(g0));
    } else if (def.sa) {
      runSA();
    } else {
      runGA(def.cross, def.memetic);
    }

    while (st.trace.length < P.tracePoints) st.trace.push(st.bestF);
    var sol = '';
    for (var i = 0; i < 81; i++) sol += st.bestG[i];
    return { method: method, solved: st.solved, evals: st.evals, bestF: st.bestF,
             ms: now() - t0, trace: st.trace, solution: sol, restarts: st.restarts };

    function pickSwap(g) {
      var blk = ctx.blocks[ctx.swappable[Math.floor(rnd() * ctx.swappable.length)]].free;
      var a = Math.floor(rnd() * blk.length), b = Math.floor(rnd() * (blk.length - 1));
      if (b >= a) b++;
      return [blk[a], blk[b]];
    }

    function runSA() {
      var g = new Uint8Array(81);
      var f, T;
      function restart() { randomInit(ctx, rnd, g); f = fullCost(g); note(g, f); T = P.saT0; }
      restart();
      while (!over()) {
        for (var m = 0; m < P.saChain && !over(); m++) {
          var p = pickSwap(g);
          var d = swapDelta(g, p[0], p[1]);
          note(g, f + d);
          if (d <= 0 || rnd() < Math.exp(-d / T)) f += d; else swapDelta(g, p[0], p[1]);
        }
        T *= P.saAlpha;
        if (T < P.saTmin && !over()) { st.restarts++; restart(); }
      }
    }

    function localSearch(g, f) {
      for (var s = 0; s < P.lsSteps && f > 0 && !over(); s++) {
        var p = pickSwap(g);
        var d = swapDelta(g, p[0], p[1]);
        note(g, f + d);
        // lsTemp > 0: aceita pioras com Metropolis (recozimento curto); 0: só descida/platô
        if (d <= 0 || (P.lsTemp > 0 && rnd() < Math.exp(-d / P.lsTemp))) f += d; else swapDelta(g, p[0], p[1]);
      }
      return f;
    }

    function runGA(useCross, memetic) {
      var N = P.popSize, pop = [], i, ind;
      function newPop() {
        pop = [];
        for (i = 0; i < N && !over(); i++) {
          ind = { g: new Uint8Array(81), f: 0, age: 0 };
          randomInit(ctx, rnd, ind.g);
          ind.f = fullCost(ind.g);
          note(ind.g, ind.f);
          pop.push(ind);
        }
      }
      function byFit(a, b) { return (a.f + a.age) - (b.f + b.age); }
      newPop();
      var gens = 0, prevBest = null;
      while (!over()) {
        pop.sort(byFit);
        if (P.aging && pop[0] === prevBest) { pop[0].age++; pop.sort(byFit); }
        prevBest = pop[0];
        if (gens >= P.restartGens) { gens = 0; st.restarts++; prevBest = null; newPop(); continue; }
        var next = [pop[0]];
        for (i = 1; i < N && !over(); i++) {
          var p1 = pop[Math.floor(rnd() * i)], p2 = pop[Math.floor(rnd() * i)];
          var child = { g: new Uint8Array(81), f: 0, age: 0 };
          if (useCross) crossoverBlocks(ctx, p1.g, p2.g, rnd, child.g); else child.g.set(p1.g);
          mutateArticle(ctx, child.g, rnd, P);
          child.f = fullCost(child.g);
          note(child.g, child.f);
          if (memetic && child.f > 0) child.f = localSearch(child.g, child.f);
          next.push(child);
        }
        if (next.length === N) pop = next;
        gens++;
      }
    }
  }

  // ---------- solver exato (MRV + bitmasks) ----------
  // Conta soluções até `limit`; guarda a primeira solução e o número de nós de busca.
  function solveExact(clues, limit, rnd, nodeCap) {
    var g = new Int8Array(81), R = new Int16Array(9), C = new Int16Array(9), B = new Int16Array(9);
    var i;
    for (i = 0; i < 81; i++) {
      g[i] = clues[i];
      if (g[i]) { var bit = 1 << g[i]; R[(i / 9) | 0] |= bit; C[i % 9] |= bit; B[((((i / 9) | 0) / 3) | 0) * 3 + (((i % 9) / 3) | 0)] |= bit; }
    }
    var count = 0, nodes = 0, first = null, aborted = false;
    function rec() {
      if (aborted) return;
      var best = -1, bestN = 10, bestM = 0, r, c, b, m, n;
      for (var k = 0; k < 81; k++) {
        if (g[k]) continue;
        r = (k / 9) | 0; c = k % 9; b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
        m = ~(R[r] | C[c] | B[b]) & 0x3FE;
        n = POP[m];
        if (n < bestN) { bestN = n; best = k; bestM = m; if (n === 0) return; if (n === 1) break; }
      }
      if (best < 0) { count++; if (!first) first = Uint8Array.from(g); return; }
      r = (best / 9) | 0; c = best % 9; b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      var digits = [];
      for (var d = 1; d <= 9; d++) if ((bestM >> d) & 1) digits.push(d);
      if (rnd) shuffleInPlace(digits, rnd);
      for (var q = 0; q < digits.length; q++) {
        var dd = digits[q], bt = 1 << dd;
        g[best] = dd; R[r] |= bt; C[c] |= bt; B[b] |= bt;
        nodes++;
        if (nodeCap && nodes > nodeCap) { aborted = true; }
        else rec();
        g[best] = 0; R[r] &= ~bt; C[c] &= ~bt; B[b] &= ~bt;
        if (count >= limit || aborted) return;
      }
    }
    rec();
    return { count: count, nodes: nodes, solution: first, aborted: aborted };
  }

  function runBacktracking(clues, cap) {
    var t0 = now();
    var r = solveExact(clues, 1, null, 0);
    var sol = '';
    var s = r.solution || clues;
    for (var i = 0; i < 81; i++) sol += s[i];
    return { method: 'bt', solved: r.count > 0, evals: r.nodes, bestF: r.count > 0 ? 0 : 1, ms: now() - t0,
             trace: [], solution: sol, restarts: 0 };
  }

  // O puzzle é resolvível só com "naked singles" + "hidden singles"?
  function solvableBySingles(clues) {
    var g = Int8Array.from(clues), changed = true, i, d;
    function cand(k) {
      var r = (k / 9) | 0, c = k % 9, m = 0, j;
      for (j = 0; j < 9; j++) { m |= 1 << g[r * 9 + j]; m |= 1 << g[j * 9 + c]; }
      var br = ((r / 3) | 0) * 3, bc = ((c / 3) | 0) * 3;
      for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) m |= 1 << g[(br + a) * 9 + bc + b];
      return ~m & 0x3FE;
    }
    var units = [];
    for (i = 0; i < 9; i++) {
      var ru = [], cu = [], bu = [];
      for (var j = 0; j < 9; j++) {
        ru.push(i * 9 + j); cu.push(j * 9 + i);
        bu.push((((i / 3) | 0) * 3 + ((j / 3) | 0)) * 9 + (i % 3) * 3 + (j % 3));
      }
      units.push(ru, cu, bu);
    }
    while (changed) {
      changed = false;
      for (i = 0; i < 81; i++) if (!g[i]) { var m = cand(i); if (POP[m] === 1) { for (d = 1; d <= 9; d++) if ((m >> d) & 1) g[i] = d; changed = true; } }
      for (var u = 0; u < units.length; u++) {
        for (d = 1; d <= 9; d++) {
          var spots = [], has = false;
          for (var q = 0; q < 9; q++) { var k = units[u][q]; if (g[k] === d) { has = true; break; } if (!g[k] && ((cand(k) >> d) & 1)) spots.push(k); }
          if (!has && spots.length === 1) { g[spots[0]] = d; changed = true; }
        }
      }
    }
    for (i = 0; i < 81; i++) if (!g[i]) return false;
    return true;
  }

  return {
    DEFAULTS: DEFAULTS, METHODS: METHODS,
    parsePuzzle: parsePuzzle, validateClues: validateClues, makeContext: makeContext,
    mulberry32: mulberry32, shuffleInPlace: shuffleInPlace,
    fullCost: fullCost, swapDelta: swapDelta, occurrences: occurrences,
    randomInit: randomInit, mutateArticle: mutateArticle, crossoverBlocks: crossoverBlocks,
    run: run, solveExact: solveExact, solvableBySingles: solvableBySingles
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createCore: createCore };
