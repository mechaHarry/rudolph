// ─── Utility ─────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };

function updateNoseColor(up) {
  var nose = document.querySelector('.nose-ring');
  if (nose) nose.classList.toggle('nose-up', up);
}

function updateClock() {
  $('clock').textContent = new Date().toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
setInterval(updateClock, 1000);
updateClock();

// ─── Yahoo Finance fetch helper ──────────────────────
// Extension host_permissions bypass CORS, so we fetch directly.
// Falls back to corsproxy.io for standalone (non-extension) use.
async function yahooFetch(url) {
  try {
    var res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (e) { /* direct failed */ }

  // Fallback for non-extension contexts
  try {
    var proxy = 'https://corsproxy.io/?' + encodeURIComponent(url);
    var res2 = await fetch(proxy);
    if (res2.ok) return await res2.json();
  } catch (e) { /* proxy failed too */ }

  return null;
}

// ─── Per-segment gradient coloring ───────────────────
// Each line segment between two points is colored green (up) or red (down)
// with alpha intensity proportional to the magnitude of the change.
function segmentBorderColor(ctx) {
  var p0 = ctx.p0.parsed.y;
  var p1 = ctx.p1.parsed.y;
  if (p0 == null || p1 == null) return 'rgba(107,122,144,0.3)';
  return p1 >= p0 ? 'rgb(0,160,66)' : 'rgb(200,65,65)';
}

function segmentFillColor(ctx) {
  var p0 = ctx.p0.parsed.y;
  var p1 = ctx.p1.parsed.y;
  if (p0 == null || p1 == null) return 'transparent';
  return p1 >= p0 ? 'rgba(0,160,66,0.18)' : 'rgba(200,65,65,0.18)';
}

var segmentStyle = {
  borderColor: function(ctx) { return segmentBorderColor(ctx); },
  backgroundColor: function(ctx) { return segmentFillColor(ctx); }
};

// ─── Mega dataset: all-time daily OHLC for accurate min/max ──
var megaData = null; // { timestamps:[], highs:[], lows:[], closes:[] }

async function fetchMegaData() {
  var json = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=max&interval=1d');
  if (json && json.chart && json.chart.result) {
    var result = json.chart.result[0];
    var ts = result.timestamp || [];
    var q = result.indicators.quote[0];
    megaData = {
      timestamps: ts,
      highs: q.high || [],
      lows: q.low || [],
      closes: q.close || []
    };
  }
}

function sliceMega(daysBack) {
  if (!megaData) return null;
  var cutoffTs = daysBack > 0
    ? Math.floor(Date.now() / 1000) - daysBack * 86400
    : 0;
  var closes = [], lo = Infinity, hi = -Infinity;
  for (var i = 0; i < megaData.timestamps.length; i++) {
    if (megaData.timestamps[i] < cutoffTs) continue;
    var c = megaData.closes[i];
    if (c !== null && isFinite(c)) closes.push(c);
    var l = megaData.lows[i];
    var h = megaData.highs[i];
    if (l !== null && isFinite(l) && l < lo) lo = l;
    if (h !== null && isFinite(h) && h > hi) hi = h;
  }
  if (!isFinite(lo) || !isFinite(hi) || closes.length === 0) return null;
  return { closes: closes, min: lo, max: hi };
}

function computeStatsFromMega(daysBack) {
  var s = sliceMega(daysBack);
  if (!s) return null;
  return {
    diff: s.max - s.min,
    pct: s.min !== 0 ? ((s.max - s.min) / s.min) * 100 : 0,
    up: s.closes[s.closes.length - 1] >= s.closes[0],
    min: s.min,
    max: s.max
  };
}

function getBounds(daysBack, fallbackArrays) {
  var s = sliceMega(daysBack);
  if (s) return { lo: Math.floor(s.min), hi: Math.ceil(s.max) };
  var lo = Infinity, hi = -Infinity;
  for (var i = 0; i < fallbackArrays.length; i++) {
    var arr = fallbackArrays[i];
    if (!arr) continue;
    for (var j = 0; j < arr.length; j++) {
      var v = arr[j];
      if (v !== null && v !== undefined && isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  return { lo: Math.floor(lo), hi: Math.ceil(hi) };
}

function applyBounds(chart, bounds) {
  if (isFinite(bounds.lo) && isFinite(bounds.hi)) {
    chart.options.scales.y.min = bounds.lo;
    chart.options.scales.y.max = bounds.hi;
  }
}

function chartOptions(xPadding) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e2736', titleColor: '#e4e8ef', bodyColor: '#e4e8ef',
        borderColor: '#2a3548', borderWidth: 1, padding: 10,
        callbacks: { label: function(c) { return c.dataset.label + ': $' + (c.parsed.y != null ? c.parsed.y.toFixed(2) : '--'); } }
      }
    },
    scales: {
      x: { ticks: { color: '#8b9bb0', maxRotation: 0, autoSkipPadding: xPadding || 30, font: { size: 9 } }, grid: { color: 'rgba(30,39,54,.6)' } },
      y: {
        ticks: { color: '#8b9bb0', font: { size: 9 }, callback: function(v) { return '$' + (v >= 100 ? Math.round(v) : v.toFixed(2)); } },
        grid: { color: 'rgba(30,39,54,.6)' }
      }
    }
  };
}

// Helper: find first and last non-null values in an array
function firstLast(data) {
  var first = null, last = null;
  for (var i = 0; i < data.length; i++) { if (data[i] !== null) { first = data[i]; break; } }
  for (var j = data.length - 1; j >= 0; j--) { if (data[j] !== null) { last = data[j]; break; } }
  return { first: first, last: last };
}

// Grow/shrink always from chart data (native granularity).
// Diff/pct/min/max/up from mega when available, chart data as fallback.
function computeStats(data, daysBack) {
  var growing = 0, shrinking = 0, segments = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i] !== null && data[i - 1] !== null) {
      segments++;
      if (data[i] > data[i - 1]) growing++;
      else if (data[i] < data[i - 1]) shrinking++;
    }
  }
  var growPct = segments > 0 ? (growing / segments) * 100 : 0;
  var shrinkPct = segments > 0 ? (shrinking / segments) * 100 : 0;

  if (daysBack !== undefined) {
    var mega = computeStatsFromMega(daysBack);
    if (mega) {
      mega.growPct = growPct;
      mega.shrinkPct = shrinkPct;
      return mega;
    }
  }

  var fl = firstLast(data);
  var diff = 0, pct = 0;
  if (fl.first !== null && fl.last !== null) {
    diff = fl.last - fl.first;
    pct = fl.first !== 0 ? (diff / fl.first) * 100 : 0;
  }

  var lo = Infinity, hi = -Infinity;
  for (var k = 0; k < data.length; k++) {
    if (data[k] !== null && isFinite(data[k])) {
      if (data[k] < lo) lo = data[k];
      if (data[k] > hi) hi = data[k];
    }
  }

  return { diff: diff, pct: pct, growPct: growPct, shrinkPct: shrinkPct, up: diff >= 0, min: lo, max: hi };
}

// Render stats pills into a container element, and update the badge
function renderStats(statsElId, stats, hasPrior) {
  var el = $(statsElId);
  if (!el) return;
  if (!megaData) return;

  el.innerHTML =
    (hasPrior ? '<span class="stat-pill stat-prior"><span class="stat-label">\u2500\u2500</span> Prior</span>' : '') +
    '<span class="stat-pill ' + (stats.up ? 'stat-up' : 'stat-down') + '">' +
      '<span class="stat-label">\u0394</span> ' + stats.diff.toFixed(2) +
    '</span>' +
    '<span class="stat-pill ' + (stats.up ? 'stat-up' : 'stat-down') + '">' +
      stats.pct.toFixed(2) + '%' +
    '</span>' +
    '<span class="stat-pill stat-up">' +
      '<span class="stat-label">\u25B2</span> ' + stats.growPct.toFixed(0) + '%' +
    '</span>' +
    '<span class="stat-pill stat-down">' +
      '<span class="stat-label">\u25BC</span> ' + stats.shrinkPct.toFixed(0) + '%' +
    '</span>' +
    (isFinite(stats.min) ? '<span class="stat-pill"><span class="stat-label">Min</span> $' + stats.min.toFixed(2) + '</span>' : '') +
    (isFinite(stats.max) ? '<span class="stat-pill"><span class="stat-label">Max</span> $' + stats.max.toFixed(2) + '</span>' : '');

}

// ─── Ghost dataset helper ────────────────────────────
var ghostStyle = {
  borderColor: 'rgba(0,188,235,0.5)',
  borderWidth: 1.5,
  pointRadius: 0,
  pointHoverRadius: 0,
  tension: 0.3,
  fill: false,
};

function makeGhostDs(priorData) {
  var ds = { label: 'Prior', data: priorData };
  for (var k in ghostStyle) ds[k] = ghostStyle[k];
  return ds;
}

function padAlign(arr, targetLen) {
  var out = arr.slice();
  while (out.length < targetLen) out.push(null);
  if (out.length > targetLen) out = out.slice(out.length - targetLen);
  return out;
}

// ─── Hour Chart (last 60 minutes) ────────────────────
var hourlyChart;

async function fetchHourly() {
  var json = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=1d&interval=1m');
  if (json && json.chart && json.chart.result) {
    processHourlyData(json);
  } else {
    $('hourly-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:.8rem;">Unable to load live stock data</div>' +
        '<div style="font-size:.7rem;">Retrying\u2026</div>' +
      '</div>';
    loadDemoHourlyData();
  }
}

function processHourlyData(json) {
  var result = json.chart.result[0];
  var meta = result.meta;
  var timestamps = result.timestamp || [];
  var closes = result.indicators.quote[0].close || [];

  var allLabels = timestamps.map(function(t) {
    return new Date(t * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });
  var allData = closes.map(function(c) { return c !== null ? +c.toFixed(2) : null; });

  var n = allData.length;
  var cutoff = Math.max(0, n - 60);
  var labels = allLabels.slice(cutoff);
  var data = allData.slice(cutoff);

  var priorStart = Math.max(0, cutoff - 60);
  var priorData = padAlign(allData.slice(priorStart, cutoff), data.length);

  var price = meta.regularMarketPrice;
  var prevClose = meta.chartPreviousClose || meta.previousClose;
  var diff = price - prevClose;

  if (diff === 0 && allData.length > 1) {
    var fl = firstLast(allData);
    if (fl.first !== null && fl.last !== null) {
      diff = fl.last - fl.first;
      price = fl.last;
      prevClose = fl.first;
    }
  }

  var pct = prevClose ? ((diff / prevClose) * 100).toFixed(2) : '0.00';
  var up = diff >= 0;

  $('stock-price').textContent = '$' + price.toFixed(2);
  $('stock-change').innerHTML =
    '<span style="color:' + (up ? 'var(--green)' : 'var(--red)') + '">' +
      (up ? '+' : '') + diff.toFixed(2) + ' (' + (up ? '+' : '') + pct + '%) today' +
    '</span>';

  if (meta.fiftyTwoWeekHigh) $('kpi-high').textContent = '$' + meta.fiftyTwoWeekHigh.toFixed(2);
  if (meta.fiftyTwoWeekLow)  $('kpi-low').textContent  = '$' + meta.fiftyTwoWeekLow.toFixed(2);
  if (meta.marketCap) $('kpi-mcap').textContent = '$' + (meta.marketCap / 1e9).toFixed(1) + 'B';

  var stats = computeStats(data, 1);
  renderStats('hourly-stats', stats, true);

  updateNoseColor(up);
  renderHourlyChart(labels, data, prevClose, priorData);
  $('hourly-loader').style.display = 'none';
}

function loadDemoHourlyData() {
  var basePrice = 62.50;
  var allLabels = [];
  var allData = [];
  var now = new Date();
  now.setHours(9, 30, 0, 0);

  for (var i = 0; i < 390; i++) {
    var t = new Date(now.getTime() + i * 60000);
    allLabels.push(t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    var noise = (Math.random() - 0.48) * 0.3;
    var trend = i * 0.002;
    allData.push(+(basePrice + trend + noise + Math.sin(i / 40) * 0.4).toFixed(2));
  }

  var n = allData.length;
  var cutoff = Math.max(0, n - 60);
  var labels = allLabels.slice(cutoff);
  var data = allData.slice(cutoff);
  var priorData = padAlign(allData.slice(Math.max(0, cutoff - 60), cutoff), data.length);

  var price = data[data.length - 1];
  var prevClose = basePrice;
  var diff = price - prevClose;
  var pct = ((diff / prevClose) * 100).toFixed(2);
  var up = diff >= 0;

  $('stock-price').textContent = '$' + price.toFixed(2);
  $('stock-change').innerHTML =
    '<span style="color:' + (up ? 'var(--green)' : 'var(--red)') + '">' +
      (up ? '+' : '') + diff.toFixed(2) + ' (' + (up ? '+' : '') + pct + '%)' +
    '</span> <span style="color:var(--muted);">(demo)</span>';

  $('kpi-high').textContent = '$67.42';
  $('kpi-low').textContent  = '$44.50';
  $('kpi-mcap').textContent = '$249.8B';

  var stats = computeStats(data, 1);
  renderStats('hourly-stats', stats, true);

  updateNoseColor(up);
  renderHourlyChart(labels, data, prevClose, priorData);
}

function renderHourlyChart(labels, data, prevClose, priorData) {
  var dataset = {
    label: 'CSCO', data: data,
    borderColor: 'rgba(107,122,144,0.5)',
    backgroundColor: 'rgba(107,122,144,0.15)',
    segment: segmentStyle,
    borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, tension: 0.3, fill: true,
  };
  var prevDs = {
    label: 'Prev Close', data: Array(labels.length).fill(prevClose),
    borderColor: 'rgba(107,122,144,.35)', borderWidth: 1, borderDash: [6, 4],
    pointRadius: 0, fill: false,
  };
  var datasets = [dataset, prevDs];
  if (priorData) datasets.push(makeGhostDs(priorData));

  var bounds = getBounds(1, [data, priorData]);

  if (hourlyChart) {
    hourlyChart.data.labels = labels;
    hourlyChart.data.datasets = datasets;
    applyBounds(hourlyChart, bounds);
    hourlyChart.update('none');
  } else {
    var opts = chartOptions(30);
    opts.scales.y.min = bounds.lo;
    opts.scales.y.max = bounds.hi;
    var ctx = $('hourlyChart').getContext('2d');
    hourlyChart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: opts
    });
  }
}

// ─── Daily Chart (per-minute intervals, prior day ghost) ─
var stockChart;

async function fetchStockWithFallback() {
  var json = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=5d&interval=1m');
  if (json && json.chart && json.chart.result) {
    processStockData(json);
  } else {
    $('stock-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:.8rem;">Unable to load data</div>' +
        '<div style="font-size:.7rem;">Retrying\u2026</div>' +
      '</div>';
  }
}

function processStockData(json) {
  var result = json.chart.result[0];
  var meta = result.meta;
  var timestamps = result.timestamp || [];
  var closes = result.indicators.quote[0].close || [];

  var byDate = {};
  for (var i = 0; i < timestamps.length; i++) {
    var d = new Date(timestamps[i] * 1000);
    var dateKey = d.toDateString();
    if (!byDate[dateKey]) byDate[dateKey] = { labels: [], data: [] };
    byDate[dateKey].labels.push(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    byDate[dateKey].data.push(closes[i] !== null ? +closes[i].toFixed(2) : null);
  }

  var dates = Object.keys(byDate).sort(function(a, b) { return new Date(a) - new Date(b); });
  var cur = byDate[dates[dates.length - 1]] || { labels: [], data: [] };
  var prev = dates.length >= 2 ? byDate[dates[dates.length - 2]] : null;

  var labels = cur.labels;
  var data = cur.data;
  var priorData = prev ? padAlign(prev.data, data.length) : null;

  var prevClose = meta.chartPreviousClose || meta.previousClose;
  var stats = computeStats(data, 2);
  renderStats('today-stats', stats, true);

  renderStockChart(labels, data, prevClose, priorData);
  $('stock-loader').style.display = 'none';
}

function renderStockChart(labels, data, prevClose, priorData) {
  var dataset = {
    label: 'CSCO', data: data,
    borderColor: 'rgba(107,122,144,0.5)',
    backgroundColor: 'rgba(107,122,144,0.15)',
    segment: segmentStyle,
    borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, tension: 0.3, fill: true,
  };
  var prevDs = {
    label: 'Prev Close', data: Array(labels.length).fill(prevClose),
    borderColor: 'rgba(107,122,144,.35)', borderWidth: 1, borderDash: [6, 4],
    pointRadius: 0, fill: false,
  };
  var datasets = [dataset, prevDs];
  if (priorData) datasets.push(makeGhostDs(priorData));

  var bounds = getBounds(2, [data, priorData]);

  if (stockChart) {
    stockChart.data.labels = labels;
    stockChart.data.datasets = datasets;
    applyBounds(stockChart, bounds);
    stockChart.update('none');
  } else {
    var opts = chartOptions(30);
    opts.scales.y.min = bounds.lo;
    opts.scales.y.max = bounds.hi;
    var ctx = $('stockChart').getContext('2d');
    stockChart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: opts
    });
  }
}

// ─── Range Charts (1 Month, 1 Year, All-Time) ───────
var rangeCharts = {};

var ranges = [
  { id: 'month',   canvasId: 'monthChart',   loaderId: 'month-loader',   statsId: 'month-stats',   range: '3mo',  interval: '1d',  labelFmt: { month: 'short', day: 'numeric' }, hasPrior: true,  megaDays: 90 },
  { id: 'year',    canvasId: 'yearChart',     loaderId: 'year-loader',    statsId: 'year-stats',    range: '2y',   interval: '1d',  labelFmt: { year: 'numeric', month: 'short' }, hasPrior: true,  megaDays: 730 },
  { id: 'alltime', canvasId: 'alltimeChart',  loaderId: 'alltime-loader', statsId: 'alltime-stats', range: 'max',  interval: '1mo', labelFmt: { year: 'numeric', month: 'short' }, hasPrior: false, megaDays: 0 },
];

async function fetchRange(cfg) {
  var json = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=' + cfg.range + '&interval=' + cfg.interval);
  if (json && json.chart && json.chart.result) {
    var result = json.chart.result[0];
    var timestamps = result.timestamp || [];
    var closes = result.indicators.quote[0].close || [];

    var allLabels = timestamps.map(function(t) {
      return new Date(t * 1000).toLocaleDateString('en-US', cfg.labelFmt);
    });
    var allData = closes.map(function(c) { return c !== null ? +c.toFixed(2) : null; });

    var labels, data, priorData = null;
    if (cfg.hasPrior) {
      var half = Math.floor(allData.length / 2);
      priorData = allData.slice(0, half);
      data = allData.slice(half);
      labels = allLabels.slice(half);
      priorData = padAlign(priorData, data.length);
    } else {
      labels = allLabels;
      data = allData;
    }

    var stats = computeStats(data, cfg.megaDays);
    renderStats(cfg.statsId, stats, cfg.hasPrior);
    renderRangeChart(cfg, labels, data, priorData);
    $(cfg.loaderId).style.display = 'none';
  } else {
    $(cfg.loaderId).innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:.8rem;">Unable to load data</div>' +
        '<div style="font-size:.7rem;color:var(--muted);">Retrying&hellip;</div>' +
      '</div>';
  }
}

function renderRangeChart(cfg, labels, data, priorData) {
  var dataset = {
    label: 'CSCO', data: data,
    borderColor: 'rgba(107,122,144,0.5)',
    backgroundColor: 'rgba(107,122,144,0.15)',
    segment: segmentStyle,
    borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, tension: 0.3, fill: true,
  };
  var datasets = [dataset];
  if (priorData) datasets.push(makeGhostDs(priorData));

  var bounds = getBounds(cfg.megaDays, [data, priorData]);

  if (rangeCharts[cfg.id]) {
    var ch = rangeCharts[cfg.id];
    ch.data.labels = labels;
    ch.data.datasets = datasets;
    applyBounds(ch, bounds);
    ch.update('none');
  } else {
    var opts = chartOptions(40);
    opts.scales.y.min = bounds.lo;
    opts.scales.y.max = bounds.hi;
    var ctx = $(cfg.canvasId).getContext('2d');
    rangeCharts[cfg.id] = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: opts
    });
  }
}

function fetchAllRanges() {
  ranges.forEach(function(cfg) { fetchRange(cfg); });
}

// ─── Refresh Interval Setting ────────────────────────
var refreshTimerStock = null;
var refreshTimerRanges = null;

function getRefreshInterval() {
  var saved = localStorage.getItem('insight-refresh');
  return saved ? parseInt(saved, 10) : 1000;
}

function setRefreshInterval(ms) {
  localStorage.setItem('insight-refresh', ms);
  startTimers(ms);
  // Update button states
  var btns = document.querySelectorAll('.refresh-btn');
  btns.forEach(function(btn) {
    btn.classList.toggle('active', parseInt(btn.getAttribute('data-interval'), 10) === ms);
  });
}

var refreshTimerHourly = null;

function startTimers(ms) {
  if (refreshTimerHourly) clearInterval(refreshTimerHourly);
  if (refreshTimerStock) clearInterval(refreshTimerStock);
  if (refreshTimerRanges) clearInterval(refreshTimerRanges);
  refreshTimerHourly = setInterval(fetchHourly, ms);
  var dailyMs = Math.max(ms * 5, 5000);
  refreshTimerStock = setInterval(fetchStockWithFallback, dailyMs);
  var rangeMs = Math.max(ms * 10, 30000);
  refreshTimerRanges = setInterval(function() { fetchMegaData(); fetchAllRanges(); }, rangeMs);
}

// Wire up buttons
document.addEventListener('DOMContentLoaded', function() {
  var savedMs = getRefreshInterval();
  // Set initial active state
  var btns = document.querySelectorAll('.refresh-btn');
  btns.forEach(function(btn) {
    var val = parseInt(btn.getAttribute('data-interval'), 10);
    btn.classList.toggle('active', val === savedMs);
    btn.addEventListener('click', function() {
      setRefreshInterval(val);
    });
  });
});

// ─── Init ────────────────────────────────────────────
fetchMegaData();
fetchHourly();
fetchStockWithFallback();
fetchAllRanges();
startTimers(getRefreshInterval());
