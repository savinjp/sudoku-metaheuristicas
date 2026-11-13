/* Interface do laboratório. Depende de: createCore (core.js), SudokuStats (stats.js), SUDOKU_PUZZLES (puzzles.js). */
(function () {
  'use strict';

  var core = createCore();
  var S = SudokuStats;
  var $ = function (id) { return document.getElementById(id); };

  var METHODS = [
    { id: 'ag', label: 'AG (artigo)', short: 'AG', dash: '', checked: true,
      desc: 'População de 21, elitismo, cruzamento por blocos, mutação com folga, envelhecimento e reinício (réplica a partir da descrição do artigo).' },
    { id: 'ag_sem_cruz', label: 'AG sem cruzamento', short: 'AG s/ cruz.', dash: '6 3', checked: true,
      desc: 'Igual ao AG, mas cada filho é cópia de um pai mais mutação. Isola o efeito do cruzamento (ablação).' },
    { id: 'sa', label: 'Simulated Annealing', short: 'SA', dash: '2 3', checked: true,
      desc: 'Uma única solução; vizinhança = troca de duas células livres no mesmo bloco; resfriamento geométrico com reinício.' },
    { id: 'ag_mem', label: 'AG memético (AG + busca local)', short: 'AG mem.', dash: '10 3 2 3', checked: true,
      desc: 'AG em que cada filho passa por uma busca local de trocas dentro dos blocos (hibridização).' },
    { id: 'bt', label: 'Backtracking (referência exata)', short: 'Backtr.', dash: '', checked: false,
      desc: 'Busca exata com heurística MRV. Serve de referência de tempo; aqui "avaliações" são nós de busca e não entram nos testes nem nos gráficos.' }
  ];
  var BY_ID = {};
  METHODS.forEach(function (m) { BY_ID[m.id] = m; });

  var PARAMS = [
    { k: 'popSize', label: 'População (AG)', type: 'int', min: 2 },
    { k: 'maxSwaps', label: 'Trocas por mutação (máx.)', type: 'int', min: 1 },
    { k: 'slack', label: 'Folga da mutação (0 desliga)', type: 'int', min: 0 },
    { k: 'restartGens', label: 'Gerações até reiniciar', type: 'int', min: 1 },
    { k: 'lsSteps', label: 'Passos de busca local (memético)', type: 'int', min: 1 },
    { k: 'lsTemp', label: 'Temperatura da busca local (0 = só descida)', type: 'float', min: 0 },
    { k: 'saT0', label: 'SA: temperatura inicial', type: 'float', min: 0.01 },
    { k: 'saAlpha', label: 'SA: fator de resfriamento', type: 'float', min: 0.5, max: 0.9999 },
    { k: 'saChain', label: 'SA: movimentos por temperatura', type: 'int', min: 1 },
    { k: 'saTmin', label: 'SA: temperatura mínima (reinicia)', type: 'float', min: 0.001 },
    { k: 'mutFree', label: 'Mutação só em células livres', type: 'bool' },
    { k: 'aging', label: 'Envelhecimento do melhor', type: 'bool' }
  ];

  var state = { runs: [], running: false, workers: [], queue: [], total: 0, done: 0, t0: 0,
                cfg: null, lastShown: null, gen: 0, allJobs: [], byId: {}, doneIds: {} };

  // ---------- montagem inicial ----------
  function buildTierSelect() {
    var sel = $('tier'), html = '';
    Object.keys(SUDOKU_TIERS).forEach(function (k) {
      var n = SUDOKU_PUZZLES[k].length, clues = SUDOKU_PUZZLES[k][0].clues;
      var tag = (k === 'muito_dificil' ? 'até ' : '') + clues + ' pistas';
      html += '<option value="' + k + '">' + SUDOKU_TIERS[k].label + ' (' + tag + ', ' + n + ' puzzles)</option>';
    });
    html += '<option value="custom">Personalizado (colar um puzzle)</option>';
    sel.innerHTML = html;
    sel.value = 'medio';
  }

  function buildMethods() {
    var html = '';
    METHODS.forEach(function (m) {
      html += '<div class="method"><input type="checkbox" id="m_' + m.id + '" ' + (m.checked ? 'checked' : '') + '>' +
        '<div><label for="m_' + m.id + '"><span class="swatch" style="background:var(--m-' + m.id + ')"></span>' + m.label + '</label>' +
        '<small>' + m.desc + '</small></div></div>';
    });
    $('methods').innerHTML = html;
    METHODS.forEach(function (m) { $('m_' + m.id).addEventListener('change', updateEstimate); });
  }

  function buildParams() {
    var html = '';
    PARAMS.forEach(function (p) {
      var def = core.DEFAULTS[p.k];
      if (p.type === 'bool') {
        html += '<div class="field check"><input type="checkbox" id="p_' + p.k + '" ' + (def ? 'checked' : '') + '><label for="p_' + p.k + '">' + p.label + '</label></div>';
      } else {
        html += '<div class="field"><label for="p_' + p.k + '">' + p.label + '</label><input type="number" id="p_' + p.k + '" value="' + def + '" min="' + p.min + '"' +
          (p.max ? ' max="' + p.max + '"' : '') + ' step="' + (p.type === 'int' ? 1 : 'any') + '"></div>';
      }
    });
    var hc = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2)));
    html += '<div class="field"><label for="threads">Threads (workers)</label><input type="number" id="threads" min="1" max="16" step="1" value="' + hc + '"></div>';
    $('advParams').innerHTML = html;
  }

  function readParams() {
    var out = {};
    PARAMS.forEach(function (p) {
      var el = $('p_' + p.k);
      if (p.type === 'bool') out[p.k] = el.checked;
      else {
        var v = p.type === 'int' ? parseInt(el.value, 10) : parseFloat(el.value);
        out[p.k] = isFinite(v) ? v : core.DEFAULTS[p.k];
      }
    });
    return out;
  }

  // ---------- puzzles ----------
  function currentPuzzles() {
    var tier = $('tier').value;
    if (tier === 'custom') {
      var txt = $('custom').value.trim();
      if (!txt) return { error: 'Cole um puzzle com 81 caracteres.', list: [] };
      try {
        var clues = core.parsePuzzle(txt);
        var err = core.validateClues(clues);
        if (err) return { error: err, list: [] };
        var n = 0; for (var i = 0; i < 81; i++) if (clues[i]) n++;
        var chk = core.solveExact(clues, 2, null, 200000);
        if (chk.count === 0 && !chk.aborted) return { error: 'Este puzzle não tem solução.', list: [] };
        var extra = chk.aborted ? ' (não consegui confirmar a unicidade a tempo)' : chk.count > 1 ? ' (atenção: tem mais de uma solução; qualquer uma encerra a execução)' : ' (solução única)';
        return { list: [{ id: 'personalizado', grid: Array.from(clues).join(''), clues: n, nodes: chk.nodes }], note: n + ' pistas' + extra };
      } catch (e) { return { error: e.message, list: [] }; }
    }
    var all = SUDOKU_PUZZLES[tier], sel = $('puzzleSel').value;
    if (sel === 'all') return { list: all };
    return { list: [all[parseInt(sel, 10)]] };
  }

  function fillPuzzleSelect() {
    var tier = $('tier').value, sel = $('puzzleSel');
    $('customBox').hidden = tier !== 'custom';
    if (tier === 'custom') { sel.innerHTML = '<option value="all">Puzzle personalizado</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    var arr = SUDOKU_PUZZLES[tier], html = '<option value="all">Todos os ' + arr.length + ' puzzles do nível</option>';
    arr.forEach(function (p, i) { html += '<option value="' + i + '">Puzzle ' + (i + 1) + ' (' + p.clues + ' pistas)</option>'; });
    sel.innerHTML = html;
  }

  function drawBoard(el, gridStr, cluesStr, markBad) {
    var g = gridStr.split('').map(Number), cl = cluesStr ? cluesStr.split('').map(Number) : g;
    var bad = new Array(81).fill(false), i, j;
    if (markBad) {
      for (i = 0; i < 81; i++) {
        var r = Math.floor(i / 9), c = i % 9;
        for (j = 0; j < 9; j++) {
          var a = r * 9 + j, b = j * 9 + c;
          if (a !== i && g[a] === g[i] && g[i]) bad[i] = true;
          if (b !== i && g[b] === g[i] && g[i]) bad[i] = true;
        }
      }
    }
    var html = '';
    for (i = 0; i < 81; i++) {
      var rr = Math.floor(i / 9), cc = i % 9;
      var cls = 'cell' + (cc % 3 === 2 && cc !== 8 ? ' c3' : '') + (rr % 3 === 2 && rr !== 8 ? ' r3' : '') + (cc === 8 ? ' c8' : '') + (rr === 8 ? ' r8' : '') +
        (cl[i] ? ' clue' : '') + (bad[i] ? ' bad' : '');
      html += '<div class="' + cls + '">' + (g[i] ? g[i] : '') + '</div>';
    }
    el.innerHTML = html;
  }

  function refreshPuzzleView() {
    var p = currentPuzzles();
    var info = $('puzzleInfo');
    if (p.error) {
      info.textContent = p.error; info.className = 'hint err';
      $('customMsg').textContent = p.error; $('customMsg').className = 'hint err';
      drawBoard($('boardPuzzle'), new Array(82).join('0'));
      return p;
    }
    info.className = 'hint';
    $('customMsg').className = 'hint'; $('customMsg').textContent = p.note || '';
    var first = p.list[0];
    drawBoard($('boardPuzzle'), first.grid);
    if ($('tier').value === 'custom') info.textContent = p.note;
    else {
      var extra = p.list.length > 1 ? ' Mostrando o primeiro de ' + p.list.length + '.' : '';
      info.textContent = first.clues + ' pistas; resolvível só com singles: ' + (first.singles ? 'sim' : 'não') + '; nós de busca do solver exato: ' + first.nodes + '.' + extra;
    }
    return p;
  }

  function selectedMethods() {
    return METHODS.filter(function (m) { return $('m_' + m.id).checked; }).map(function (m) { return m.id; });
  }

  function updateEstimate() {
    var p = currentPuzzles(), runs = parseInt($('runs').value, 10) || 0;
    var m = selectedMethods();
    var n = p.list.length * runs * m.length;
    var msg = '';
    if (p.error) msg = '';
    else if (!m.length) msg = 'Selecione ao menos um método.';
    else msg = p.list.length + ' puzzle(s) × ' + runs + ' execução(ões) × ' + m.length + ' método(s) = ' + n.toLocaleString('pt-BR') + ' execuções.';
    $('estimate').textContent = msg;
    $('runBtn').disabled = state.running || !!p.error || !m.length || runs < 1;
  }

  // ---------- execução (pool de workers) ----------
  function workerSource() {
    return 'var createCore=' + createCore.toString() + ';var core=createCore();' +
      'self.onmessage=function(e){var m=e.data;try{var r=core.run(m.method,Uint8Array.from(m.clues),m.seed,m.cap,m.params);' +
      'self.postMessage({id:m.id,r:r});}catch(err){self.postMessage({id:m.id,error:String(err&&err.message||err)});}};';
  }

  function makeWorker() {
    var blob = new Blob([workerSource()], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    var w = new Worker(url);
    w._url = url;
    return w;
  }

  function stopAll() {
    state.gen++;
    state.workers.forEach(function (w) { try { w.terminate(); URL.revokeObjectURL(w._url); } catch (e) { /* ignora */ } });
    state.workers = [];
    state.queue = [];
  }

  function start() {
    var pz = currentPuzzles();
    var methods = selectedMethods();
    var runs = parseInt($('runs').value, 10), cap = parseInt($('cap').value, 10), seed = parseInt($('seed').value, 10) || 0;
    if (pz.error || !methods.length || !(runs >= 1) || !(cap >= 100)) return;
    var params = readParams();
    var threads = Math.max(1, Math.min(16, parseInt($('threads').value, 10) || 1));

    stopAll();
    state.runs = []; state.lastShown = null;
    state.cfg = { tier: $('tier').value, puzzles: pz.list.map(function (p) { return p.id; }), methods: methods, runs: runs, cap: cap, seed: seed, params: params };
    var jobs = [], id = 0;
    // ordem intercalada (execução > puzzle > método): resultados parciais ficam balanceados
    for (var r = 0; r < runs; r++) {
      for (var pi = 0; pi < pz.list.length; pi++) {
        for (var mi = 0; mi < methods.length; mi++) {
          jobs.push({ id: id++, method: methods[mi], pid: pz.list[pi].id, pidx: pi, run: r, clues: Array.from(core.parsePuzzle(pz.list[pi].grid)),
                      cluesStr: pz.list[pi].grid, seed: ((seed + 7919 * (pi + 1) + 104729 * (r + 1)) >>> 0), cap: cap, params: params });
        }
      }
    }
    state.allJobs = jobs; state.byId = {}; state.doneIds = {};
    jobs.forEach(function (j) { state.byId[j.id] = j; });
    state.total = jobs.length; state.done = 0; state.t0 = performance.now(); state.running = true;
    $('runBtn').disabled = true; $('stopBtn').disabled = false;
    $('progressPanel').hidden = false;
    $('progressTxt').textContent = '';
    renderAll(true);

    var gen = state.gen, started = false;
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        state.queue = jobs.slice().reverse(); // pop() entrega na ordem original
        var n = Math.min(threads, state.total);
        for (var w = 0; w < n; w++) { var wk = makeWorker(); state.workers.push(wk); attach(wk, gen); feed(wk); }
        started = true;
      } catch (e) { started = false; }
    }
    if (!started) fallbackMain();
  }

  // Alternativa quando Web Workers não estão disponíveis: roda na thread principal, em fatias.
  function fallbackMain() {
    stopAll();
    var gen = state.gen;
    state.queue = state.allJobs.filter(function (j) { return !state.doneIds[j.id]; });
    runMainThread(gen);
  }

  function attach(wk, gen) {
    wk.onmessage = function (e) {
      if (gen !== state.gen) return;
      var m = e.data;
      if (m.error) { finishWithError(m.error); return; }
      accept(m.id, m.r);
      feed(wk);
    };
    wk.onerror = function (e) {
      if (gen !== state.gen) return;
      if (state.done === 0) fallbackMain(); else finishWithError(e.message || 'erro no worker');
    };
  }

  function feed(wk) {
    if (state.queue.length) {
      var j = state.queue.pop();
      wk.postMessage({ id: j.id, method: j.method, clues: j.clues, seed: j.seed, cap: j.cap, params: j.params });
    }
  }

  function runMainThread(gen) {
    var t = Date.now();
    while (state.queue.length && gen === state.gen && Date.now() - t < 40) {
      var j = state.queue.shift();
      accept(j.id, core.run(j.method, Uint8Array.from(j.clues), j.seed, j.cap, j.params));
    }
    if (gen === state.gen && state.queue.length) setTimeout(function () { runMainThread(gen); }, 0);
  }

  function accept(id, r) {
    var j = state.byId[id];
    state.doneIds[id] = true;
    state.runs.push({ method: j.method, pid: j.pid, pidx: j.pidx, run: j.run, seed: j.seed, solved: r.solved, evals: r.evals, bestF: r.bestF,
                      ms: r.ms, restarts: r.restarts, trace: r.trace, solution: r.solution, cluesStr: j.cluesStr });
    state.lastShown = state.runs[state.runs.length - 1];
    state.done++;
    if (state.done >= state.total) { finish(); return; }
    scheduleRender();
  }

  function finish() {
    stopAll();
    state.running = false;
    $('stopBtn').disabled = true;
    updateEstimate();
    renderAll(true);
  }

  function finishWithError(msg) {
    stopAll();
    state.running = false;
    $('stopBtn').disabled = true;
    updateEstimate();
    renderAll(true);
    $('progressTxt').textContent = 'Erro: ' + msg;
  }

  function stopByUser() {
    if (!state.running) return;
    stopAll();
    state.running = false;
    $('stopBtn').disabled = true;
    updateEstimate();
    renderAll(true);
    $('progressTxt').textContent = 'Interrompido: ' + state.done + ' de ' + state.total + ' execuções concluídas (resultados parciais abaixo).';
  }

  // ---------- renderização (com limitação de frequência) ----------
  var renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () { renderTimer = null; renderAll(false); }, 300);
  }

  function renderAll(final) {
    if (renderTimer && final) { clearTimeout(renderTimer); renderTimer = null; }
    var elapsed = (performance.now() - state.t0) / 1000;
    $('bar').value = state.total ? (100 * state.done / state.total) : 0;
    var eta = state.done > 0 && state.running ? ' · faltam ~' + fmtDur(elapsed / state.done * (state.total - state.done)) : '';
    $('progressTxt').textContent = state.done + ' / ' + state.total + ' execuções · ' + fmtDur(elapsed) + (state.running ? eta : (state.done >= state.total ? ' · concluído' : ''));
    if (state.lastShown) {
      var l = state.lastShown;
      drawBoard($('boardLast'), l.solution, l.cluesStr, true);
      $('lastInfo').textContent = BY_ID[l.method].label + ' · ' + l.pid + ' · execução ' + (l.run + 1) + ' · ' +
        (l.method === 'bt' ? l.evals.toLocaleString('pt-BR') + ' nós' : l.solved ? 'resolvido com ' + l.evals.toLocaleString('pt-BR') + ' avaliações' : 'não resolveu (melhor aptidão ' + l.bestF + ')');
    }
    if (!state.runs.length) return;
    var agg = aggregate();
    renderSummary(agg);
    renderCharts(agg);
    renderPairs(agg);
    renderPerPuzzle();
  }

  function fmtDur(s) {
    if (!isFinite(s)) return '...';
    if (s < 60) return Math.max(0, Math.round(s)) + ' s';
    return Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
  }
  var nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  function fInt(x) { return isFinite(x) ? nf.format(x) : '–'; }
  function fPct(x) { return isFinite(x) ? nf1.format(x) + '%' : '–'; }
  function fP(p) { return !isFinite(p) ? '–' : p < 0.0001 ? '< 0,0001' : p.toLocaleString('pt-BR', { maximumFractionDigits: 4 }); }

  // ---------- agregação ----------
  function wilson(k, n) {
    if (!n) return [NaN, NaN];
    var z = 1.96, p = k / n, d = 1 + z * z / n;
    var c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h) * 100, Math.min(1, c + h) * 100];
  }

  function aggregate() {
    var cfg = state.cfg, out = {};
    cfg.methods.forEach(function (m) { out[m] = { runs: [], ok: [], used: [], ms: [], failF: [] }; });
    state.runs.forEach(function (r) {
      var a = out[r.method]; if (!a) return;
      a.runs.push(r); a.used.push(r.solved ? r.evals : cfg.cap); a.ms.push(r.ms);
      if (r.solved) a.ok.push(r.evals); else a.failF.push(r.bestF);
    });
    cfg.methods.forEach(function (m) {
      var a = out[m];
      a.n = a.runs.length; a.k = a.ok.length; a.rate = a.n ? 100 * a.k / a.n : NaN; a.ci = wilson(a.k, a.n);
      a.okSorted = S.sortedCopy(a.ok);
      a.usedSorted = S.sortedCopy(a.used);
    });
    return out;
  }

  // ---------- tabelas ----------
  function renderSummary(agg) {
    var cfg = state.cfg, html = '<thead><tr><th>Método</th><th>Execuções</th><th>Sucessos</th><th>Taxa de sucesso [IC 95%]</th>' +
      '<th>Mediana de avaliações [Q1–Q3]</th><th>Média ± dp</th><th>Tempo médio (ms)</th><th>Aptidão final (fracassos)</th></tr></thead><tbody>';
    var bestRate = -1;
    cfg.methods.forEach(function (m) { if (m !== 'bt' && agg[m].rate > bestRate) bestRate = agg[m].rate; });
    cfg.methods.forEach(function (m) {
      var a = agg[m], isBt = m === 'bt';
      var med = a.k ? S.quantile(a.okSorted, 0.5) : NaN, q1 = a.k ? S.quantile(a.okSorted, 0.25) : NaN, q3 = a.k ? S.quantile(a.okSorted, 0.75) : NaN;
      var rateCls = !isBt && a.rate === bestRate && cfg.methods.length > 2 ? ' class="better"' : '';
      html += '<tr><td><span class="swatch" style="background:var(--m-' + m + ')"></span>' + BY_ID[m].label + '</td>' +
        '<td>' + fInt(a.n) + '</td><td>' + fInt(a.k) + '</td>' +
        '<td' + rateCls + '>' + fPct(a.rate) + ' <span class="note">[' + fPct(a.ci[0]) + '–' + fPct(a.ci[1]) + ']</span></td>' +
        '<td>' + (a.k ? fInt(med) + ' <span class="note">[' + fInt(q1) + '–' + fInt(q3) + ']</span>' : '–') + (isBt ? ' <span class="note">nós</span>' : '') + '</td>' +
        '<td>' + (a.k ? fInt(S.mean(a.ok)) + ' ± ' + fInt(S.sd(a.ok)) : '–') + '</td>' +
        '<td>' + nf1.format(S.mean(a.ms)) + '</td>' +
        '<td>' + (a.failF.length ? nf1.format(S.mean(a.failF)) + ' <span class="note">(' + a.failF.length + ')</span>' : '–') + '</td></tr>';
    });
    $('summaryTable').innerHTML = html + '</tbody>';
    $('summaryNote').textContent = 'Avaliação = uma solução candidata avaliada (completa no AG; vizinha no SA e na busca local). Mediana e quartis só consideram execuções que resolveram; as execuções que não resolveram contam o limite de ' +
      fInt(cfg.cap) + ' avaliações nos gráficos e no teste estatístico. Aptidão 0 = solução (cada dígito ausente numa linha ou coluna custa 2).';
    $('summaryPanel').hidden = false;
  }

  function renderPairs(agg) {
    var cfg = state.cfg, ms = cfg.methods.filter(function (m) { return m !== 'bt'; }), pairs = [], i, j;
    for (i = 0; i < ms.length; i++) for (j = i + 1; j < ms.length; j++) pairs.push([ms[i], ms[j]]);
    if (!pairs.length) { $('pairPanel').hidden = true; return; }
    var html = '<thead><tr><th>Comparação</th><th>Mediana de avaliações usadas</th><th>p (Mann-Whitney)</th><th>p ajustado (Bonferroni)</th><th>A12</th><th>Leitura</th></tr></thead><tbody>';
    pairs.forEach(function (pr) {
      var a = agg[pr[0]], b = agg[pr[1]];
      var t = S.mannWhitney(a.used, b.used), padj = Math.min(1, t.p * pairs.length);
      var ma = S.quantile(a.usedSorted, 0.5), mb = S.quantile(b.usedSorted, 0.5);
      var eff = Math.abs(t.a12 - 0.5), mag = eff < 0.06 ? 'desprezível' : eff < 0.14 ? 'pequeno' : eff < 0.21 ? 'médio' : 'grande';
      var reading;
      if (!isFinite(t.p) || padj >= 0.05) reading = 'sem diferença significativa';
      else reading = (t.a12 > 0.5 ? BY_ID[pr[0]].short : BY_ID[pr[1]].short) + ' usa menos avaliações (efeito ' + mag + ')';
      html += '<tr><td>' + BY_ID[pr[0]].short + ' × ' + BY_ID[pr[1]].short + '</td><td>' + fInt(ma) + ' × ' + fInt(mb) + '</td><td>' + fP(t.p) + '</td><td>' + fP(padj) +
        '</td><td>' + (isFinite(t.a12) ? t.a12.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '–') + '</td><td style="text-align:left">' + reading + '</td></tr>';
    });
    $('pairTable').innerHTML = html + '</tbody>';
    var multi = cfg.puzzles.length > 1 ? ' As execuções de puzzles diferentes foram agrupadas; para o artigo, reporte também por puzzle (tabela abaixo) ou rode um puzzle por vez.' : '';
    $('pairNote').textContent = 'Teste bicaudal sobre as avaliações usadas (o limite entra como valor para quem não resolveu), com aproximação normal e correção de empates. A12 = probabilidade de o primeiro método usar menos avaliações que o segundo (0,5 = igual).' + multi;
    $('pairPanel').hidden = false;
  }

  function renderPerPuzzle() {
    var cfg = state.cfg;
    if (cfg.puzzles.length < 2) { $('perPanel').hidden = true; return; }
    var html = '<thead><tr><th>Puzzle</th>' + cfg.methods.map(function (m) { return '<th>' + BY_ID[m].short + '<br><span class="note">sucesso · mediana</span></th>'; }).join('') + '</tr></thead><tbody>';
    cfg.puzzles.forEach(function (pid, pi) {
      html += '<tr><td>' + pid + '</td>';
      cfg.methods.forEach(function (m) {
        var rs = state.runs.filter(function (r) { return r.method === m && r.pidx === pi; });
        var ok = rs.filter(function (r) { return r.solved; }).map(function (r) { return r.evals; }).sort(function (a, b) { return a - b; });
        html += '<td>' + (rs.length ? fPct(100 * ok.length / rs.length) + ' · ' + (ok.length ? fInt(S.quantile(ok, 0.5)) : '–') : '–') + '</td>';
      });
      html += '</tr>';
    });
    $('perTable').innerHTML = html + '</tbody>';
    $('perPanel').hidden = false;
  }

  // ---------- gráficos (SVG) ----------
  function colorOf(m) { return 'var(--m-' + m + ')'; }

  function legendHtml(ms) {
    return '<div class="legend">' + ms.map(function (m) {
      var d = BY_ID[m].dash;
      return '<span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="' + colorOf(m) + '" stroke-width="3"' + (d ? ' stroke-dasharray="' + d + '"' : '') + '/></svg>' + BY_ID[m].label + '</span>';
    }).join('') + '</div>';
  }

  function renderCharts(agg) {
    var cfg = state.cfg, ms = cfg.methods.filter(function (m) { return m !== 'bt'; });
    if (!ms.length) { $('chartsPanel').hidden = true; return; }
    $('chartsPanel').hidden = false;
    $('chartBars').innerHTML = barsSvg(ms, agg);
    $('chartBox').innerHTML = boxSvg(ms, agg, cfg.cap);
    $('chartLine').innerHTML = lineSvg(ms, agg, cfg.cap) + legendHtml(ms);
  }

  function barsSvg(ms, agg) {
    var W = 520, H = 260, L = 44, R = 12, T = 28, B = 44, pw = W - L - R, ph = H - T - B;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Taxa de sucesso por método">';
    [0, 25, 50, 75, 100].forEach(function (v) {
      var y = T + ph - ph * v / 100;
      s += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="muted" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + v + '%</text>';
    });
    var slot = pw / ms.length, bw = Math.min(64, slot * 0.6);
    ms.forEach(function (m, i) {
      var a = agg[m], x = L + slot * i + (slot - bw) / 2, v = isFinite(a.rate) ? a.rate : 0, h = ph * v / 100, y = T + ph - h;
      s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(h, 0) + '" rx="3" fill="' + colorOf(m) + '"/>';
      var cx = x + bw / 2;
      if (isFinite(a.ci[0])) {
        var y1 = T + ph - ph * a.ci[1] / 100, y2 = T + ph - ph * a.ci[0] / 100;
        s += '<line x1="' + cx + '" x2="' + cx + '" y1="' + y1 + '" y2="' + y2 + '" stroke="var(--fg)" stroke-width="1.5"/><line x1="' + (cx - 5) + '" x2="' + (cx + 5) + '" y1="' + y1 + '" y2="' + y1 + '" stroke="var(--fg)" stroke-width="1.5"/><line x1="' + (cx - 5) + '" x2="' + (cx + 5) + '" y1="' + y2 + '" y2="' + y2 + '" stroke="var(--fg)" stroke-width="1.5"/>';
      }
      var topY = isFinite(a.ci[1]) ? T + ph - ph * a.ci[1] / 100 : y;
      s += '<text x="' + cx + '" y="' + Math.max(12, topY - 6) + '" text-anchor="middle" font-weight="700">' + fPct(a.rate) + '</text>';
      s += '<text x="' + cx + '" y="' + (H - 22) + '" text-anchor="middle">' + BY_ID[m].short + '</text>';
    });
    s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/></svg>';
    return s + '<p class="hint">Barras de erro: intervalo de confiança de Wilson (95%).</p>';
  }

  function boxSvg(ms, agg, cap) {
    var W = 520, H = 260, L = 52, R = 12, T = 14, B = 44, pw = W - L - R, ph = H - T - B;
    var all = []; ms.forEach(function (m) { all = all.concat(agg[m].used); });
    if (!all.length) return '';
    var lo = Math.max(1, Math.min.apply(null, all)), hi = Math.max(cap, Math.max.apply(null, all));
    var l0 = Math.floor(Math.log10(lo)), l1 = Math.ceil(Math.log10(hi));
    if (l1 === l0) l1 = l0 + 1;
    function Y(v) { return T + ph - ph * (Math.log10(Math.max(1, v)) - l0) / (l1 - l0); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Distribuição das avaliações usadas por método">';
    for (var e = l0; e <= l1; e++) {
      var y = Y(Math.pow(10, e)), lab = Math.pow(10, e);
      s += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="muted" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (lab >= 1000 ? (lab / 1000) + ' mil' : lab) + '</text>';
    }
    var yc = Y(cap);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yc + '" y2="' + yc + '" stroke="var(--danger)" stroke-dasharray="5 3"/><text x="' + (W - R) + '" y="' + (yc - 4) + '" text-anchor="end" style="fill:var(--danger)">limite</text>';
    var slot = pw / ms.length, bw = Math.min(54, slot * 0.5);
    ms.forEach(function (m, i) {
      var u = agg[m].usedSorted; if (!u.length) return;
      var cx = L + slot * i + slot / 2, q1 = S.quantile(u, .25), med = S.quantile(u, .5), q3 = S.quantile(u, .75), mn = u[0], mx = u[u.length - 1];
      s += '<line x1="' + cx + '" x2="' + cx + '" y1="' + Y(mx) + '" y2="' + Y(mn) + '" stroke="var(--fg)"/>' +
        '<line x1="' + (cx - 7) + '" x2="' + (cx + 7) + '" y1="' + Y(mx) + '" y2="' + Y(mx) + '" stroke="var(--fg)"/><line x1="' + (cx - 7) + '" x2="' + (cx + 7) + '" y1="' + Y(mn) + '" y2="' + Y(mn) + '" stroke="var(--fg)"/>' +
        '<rect x="' + (cx - bw / 2) + '" y="' + Y(q3) + '" width="' + bw + '" height="' + Math.max(2, Y(q1) - Y(q3)) + '" fill="' + colorOf(m) + '" fill-opacity=".85" stroke="var(--fg)"/>' +
        '<line x1="' + (cx - bw / 2) + '" x2="' + (cx + bw / 2) + '" y1="' + Y(med) + '" y2="' + Y(med) + '" stroke="var(--panel)" stroke-width="3"/><line x1="' + (cx - bw / 2) + '" x2="' + (cx + bw / 2) + '" y1="' + Y(med) + '" y2="' + Y(med) + '" stroke="var(--fg)" stroke-width="1.2"/>';
      s += '<text x="' + cx + '" y="' + (H - 22) + '" text-anchor="middle">' + BY_ID[m].short + '</text>';
    });
    s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/></svg>';
    return s + '<p class="hint">Caixa: Q1–Q3 com a mediana; hastes: mínimo e máximo. Quem não resolveu entra com o limite.</p>';
  }

  function lineSvg(ms, agg, cap) {
    var W = 1040, H = 280, L = 52, R = 14, T = 14, B = 40, pw = W - L - R, ph = H - T - B;
    var series = {}, maxY = 0, pts = 0;
    ms.forEach(function (m) {
      var rs = agg[m].runs.filter(function (r) { return r.trace && r.trace.length; });
      if (!rs.length) return;
      pts = rs[0].trace.length;
      var arr = [];
      for (var i = 0; i < pts; i++) { var col = rs.map(function (r) { return r.trace[i]; }).sort(function (a, b) { return a - b; }); arr.push(S.quantile(col, .5)); }
      series[m] = arr; maxY = Math.max(maxY, arr[0]);
    });
    if (!pts) return '';
    maxY = Math.max(4, Math.ceil(maxY / 4) * 4);
    function X(i) { return L + pw * (i + 1) / pts; }
    function Y(v) { return T + ph - ph * v / maxY; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Convergência da aptidão por avaliações">';
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var v = maxY * t / ticks, y = Y(v);
      s += '<line class="gridline" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="muted" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + nf1.format(v) + '</text>';
    }
    for (var q = 0; q <= 4; q++) {
      var xv = cap * q / 4, xx = L + pw * q / 4;
      s += '<text class="muted" x="' + xx + '" y="' + (H - 18) + '" text-anchor="' + (q === 0 ? 'start' : q === 4 ? 'end' : 'middle') + '">' + (xv >= 1000 ? nf.format(xv / 1000) + ' mil' : xv) + '</text>';
    }
    s += '<text class="muted" x="' + (L + pw / 2) + '" y="' + (H - 3) + '" text-anchor="middle">avaliações</text>';
    Object.keys(series).forEach(function (m) {
      var d = '';
      series[m].forEach(function (val, i) { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val).toFixed(1); });
      s += '<path d="' + d + '" fill="none" stroke="' + colorOf(m) + '" stroke-width="2.5"' + (BY_ID[m].dash ? ' stroke-dasharray="' + BY_ID[m].dash + '"' : '') + ' stroke-linejoin="round"/>';
    });
    s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/></svg>';
    return s;
  }

  // ---------- exportação ----------
  function csvEscape(v) { v = String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function stamp() { var d = new Date(); function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()); }

  function runsCsv() {
    var cfg = state.cfg, rows = ['metodo,nivel,puzzle,execucao,semente,limite,resolvido,avaliacoes,aptidao_final,tempo_ms,reinicios'];
    state.runs.slice().sort(function (a, b) { return a.method < b.method ? -1 : a.method > b.method ? 1 : a.pidx - b.pidx || a.run - b.run; }).forEach(function (r) {
      rows.push([r.method, cfg.tier, r.pid, r.run + 1, r.seed, cfg.cap, r.solved ? 1 : 0, r.evals, r.bestF, r.ms.toFixed(2), r.restarts].map(csvEscape).join(','));
    });
    return rows.join('\n');
  }

  function summaryRows() {
    var agg = aggregate(), cfg = state.cfg, out = [];
    cfg.methods.forEach(function (m) {
      var a = agg[m];
      out.push({ metodo: BY_ID[m].label, execucoes: a.n, sucessos: a.k, taxa: a.rate, ic_inf: a.ci[0], ic_sup: a.ci[1],
        mediana: a.k ? S.quantile(a.okSorted, .5) : NaN, q1: a.k ? S.quantile(a.okSorted, .25) : NaN, q3: a.k ? S.quantile(a.okSorted, .75) : NaN,
        media: a.k ? S.mean(a.ok) : NaN, dp: a.k ? S.sd(a.ok) : NaN, tempo_ms: S.mean(a.ms) });
    });
    return out;
  }
  function num(v, d) { return isFinite(v) ? Number(v).toFixed(d === undefined ? 1 : d) : ''; }

  function summaryCsv() {
    var rows = ['metodo,execucoes,sucessos,taxa_sucesso_pct,ic95_inf,ic95_sup,mediana_aval,q1_aval,q3_aval,media_aval,dp_aval,tempo_medio_ms'];
    summaryRows().forEach(function (r) { rows.push([r.metodo, r.execucoes, r.sucessos, num(r.taxa), num(r.ic_inf), num(r.ic_sup), num(r.mediana, 0), num(r.q1, 0), num(r.q3, 0), num(r.media, 0), num(r.dp, 0), num(r.tempo_ms, 2)].map(csvEscape).join(',')); });
    return rows.join('\n');
  }

  function summaryMd() {
    var cfg = state.cfg;
    var lines = ['| Método | Execuções | Taxa de sucesso | Mediana de avaliações [Q1–Q3] | Média ± dp | Tempo médio (ms) |', '|---|---:|---:|---:|---:|---:|'];
    summaryRows().forEach(function (r) {
      lines.push('| ' + r.metodo + ' | ' + r.execucoes + ' | ' + num(r.taxa) + '% | ' + (isFinite(r.mediana) ? num(r.mediana, 0) + ' [' + num(r.q1, 0) + '–' + num(r.q3, 0) + ']' : '–') + ' | ' + (isFinite(r.media) ? num(r.media, 0) + ' ± ' + num(r.dp, 0) : '–') + ' | ' + num(r.tempo_ms) + ' |');
    });
    lines.push('', 'Limite: ' + cfg.cap + ' avaliações; nível: ' + cfg.tier + '; puzzles: ' + cfg.puzzles.join(', ') + '; execuções por puzzle: ' + cfg.runs + '; semente base: ' + cfg.seed + '.');
    return lines.join('\n');
  }

  function copyText(text, btn) {
    function ok() { var t = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(function () { btn.textContent = t; }, 1400); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { window.prompt('Copie o texto abaixo:', text); }
      ta.remove();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, fallback); return; }
    } catch (e) { /* cai no fallback */ }
    fallback();
  }

  // ---------- sobre ----------
  function buildAbout() {
    $('about').innerHTML = '<ul>' +
      '<li><b>Codificação e aptidão.</b> Vetor de 81 inteiros em 9 sub-blocos; cada bloco é sempre uma permutação de 1 a 9 e as pistas ficam fixas, então só linhas e colunas precisam ser otimizadas (18 restrições). A aptidão soma, por linha e coluna, 2 para cada dígito ausente.</li>' +
      '<li><b>Avaliação como unidade de esforço.</b> Cada solução candidata avaliada conta 1, seja uma grade completa (AG) ou uma vizinha (SA e busca local). A avaliação do SA é incremental e portanto mais barata em tempo; por isso o tempo é reportado à parte.</li>' +
      '<li><b>Réplica do AG.</b> Implementado a partir da descrição do artigo (população 21, elitismo, pais sorteados entre os melhor colocados, cruzamento por blocos, mutação de 1 a 5 trocas com regra de folga, envelhecimento, reinício em 2000 gerações). Detalhes que a descrição não fixa foram decididos aqui: a folga conta as ocorrências do dígito movido na linha e na coluna de destino (a própria célula conta nas duas) e a mutação sorteia só entre células livres. Ambos podem ser alterados em "Parâmetros avançados".</li>' +
      '<li><b>Calibração.</b> A folga, a mutação e os parâmetros do SA e da busca local foram escolhidos em um conjunto separado de puzzles (tools/tuning_puzzles.js), e não nos puzzles desta página.</li>' +
      '<li><b>Dificuldade.</b> Os níveis são definidos pelo número de pistas e pelo tipo de técnica necessária (só "singles" ou não), e não pela classificação de jornais. Todos os puzzles têm solução única, verificada pelo solver exato. Para usar outro conjunto, escolha "Personalizado".</li>' +
      '<li><b>Reprodutibilidade.</b> Cada execução usa uma semente derivada da semente base, do puzzle e do número da execução; os mesmos valores reproduzem o mesmo resultado.</li>' +
      '<li><b>Estatística.</b> Teste de Mann-Whitney sobre as avaliações usadas (limite para quem não resolveu), com correção de Bonferroni entre os pares. Execuções de puzzles diferentes agrupadas não são independentes e identicamente distribuídas; trate o p-valor agregado como indicativo.</li>' +
      '</ul>';
  }

  // ---------- eventos ----------
  function init() {
    buildTierSelect(); buildMethods(); buildParams(); buildAbout(); fillPuzzleSelect();
    refreshPuzzleView(); updateEstimate();
    drawBoard($('boardLast'), new Array(82).join('0'));
    $('tier').addEventListener('change', function () { fillPuzzleSelect(); refreshPuzzleView(); updateEstimate(); });
    $('puzzleSel').addEventListener('change', function () { refreshPuzzleView(); updateEstimate(); });
    $('custom').addEventListener('input', function () { refreshPuzzleView(); updateEstimate(); });
    $('runs').addEventListener('input', updateEstimate);
    $('runBtn').addEventListener('click', start);
    $('stopBtn').addEventListener('click', stopByUser);
    $('resetParams').addEventListener('click', function () {
      PARAMS.forEach(function (p) { var el = $('p_' + p.k), d = core.DEFAULTS[p.k]; if (p.type === 'bool') el.checked = !!d; else el.value = d; });
    });
    $('dlRuns').addEventListener('click', function () { download('sudoku-execucoes-' + stamp() + '.csv', runsCsv(), 'text/csv'); });
    $('dlSummary').addEventListener('click', function () { download('sudoku-resumo-' + stamp() + '.csv', summaryCsv(), 'text/csv'); });
    $('dlJson').addEventListener('click', function () {
      download('sudoku-resultados-' + stamp() + '.json', JSON.stringify({ configuracao: state.cfg, execucoes: state.runs.map(function (r) { return { metodo: r.method, puzzle: r.pid, execucao: r.run + 1, semente: r.seed, resolvido: r.solved, avaliacoes: r.evals, aptidao_final: r.bestF, tempo_ms: r.ms, reinicios: r.restarts, convergencia: r.trace }; }) }), 'application/json');
    });
    $('copyMd').addEventListener('click', function (e) { copyText(summaryMd(), e.currentTarget); });
  }

  init();
})();
