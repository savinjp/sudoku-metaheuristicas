/* Estatística descritiva e teste de Mann-Whitney (aproximação normal com correção de empates). */
(function (root) {
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function sortedCopy(a) { return a.slice().sort(function (x, y) { return x - y; }); }

  // erfc com precisão ~1e-12 (série de Taylor para |x| pequeno, fração contínua para |x| grande)
  function erfc(x) {
    var z = Math.abs(x), r;
    if (z < 2.5) {
      var sum = z, term = z, n = 0, add;
      do { n++; term *= -z * z / n; add = term / (2 * n + 1); sum += add; } while (Math.abs(add) > 1e-17 * Math.abs(sum) && n < 200);
      r = 1 - 2 / Math.sqrt(Math.PI) * sum;
    } else {
      var tiny = 1e-300, f = z, C = z, D = 0, k;
      for (k = 1; k < 500; k++) {
        var a = k / 2;
        D = z + a * D; if (D === 0) D = tiny; D = 1 / D;
        C = z + a / C; if (C === 0) C = tiny;
        var delta = C * D; f *= delta;
        if (Math.abs(delta - 1) < 1e-15) break;
      }
      r = Math.exp(-z * z) / Math.sqrt(Math.PI) / f;
    }
    return x >= 0 ? r : 2 - r;
  }
  function normalSF2(z) { return erfc(Math.abs(z) / Math.SQRT2); } // P(|Z| >= |z|), bicaudal

  // Retorna { u, z, p, a12 }; a12 = P(X < Y) + 0,5 P(X = Y)  (menor valor = melhor)
  function mannWhitney(x, y) {
    var n1 = x.length, n2 = y.length;
    if (!n1 || !n2) return { u: NaN, z: NaN, p: NaN, a12: NaN };
    var all = [], i;
    for (i = 0; i < n1; i++) all.push([x[i], 0]);
    for (i = 0; i < n2; i++) all.push([y[i], 1]);
    all.sort(function (a, b) { return a[0] - b[0]; });
    var N = all.length, ranks = new Array(N), tieTerm = 0;
    i = 0;
    while (i < N) {
      var j = i;
      while (j + 1 < N && all[j + 1][0] === all[i][0]) j++;
      var avg = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) ranks[k] = avg;
      var t = j - i + 1; tieTerm += t * t * t - t;
      i = j + 1;
    }
    var r1 = 0;
    for (i = 0; i < N; i++) if (all[i][1] === 0) r1 += ranks[i];
    var u1 = r1 - n1 * (n1 + 1) / 2;
    var mu = n1 * n2 / 2;
    var variance = n1 * n2 / 12 * ((N + 1) - tieTerm / (N * (N - 1)));
    var z = 0, p = 1;
    if (variance > 0) {
      var diff = u1 - mu;
      z = (Math.abs(diff) - 0.5) / Math.sqrt(variance); if (z < 0) z = 0; if (diff < 0) z = -z;
      p = normalSF2(z);
    }
    // u1 conta pares com x > y; a12 = P(x < y) + .5 P(=)
    var a12 = 1 - u1 / (n1 * n2);
    return { u: u1, z: z, p: p, a12: a12 };
  }

  var api = { mean: mean, sd: sd, quantile: quantile, sortedCopy: sortedCopy, mannWhitney: mannWhitney, erfc: erfc };
  root.SudokuStats = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
