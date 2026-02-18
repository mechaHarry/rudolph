// ─── Utility ─────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };

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
  if (p0 == null || p1 == null || p0 === 0) return 'rgba(107,122,144,0.3)';
  var pct = Math.abs((p1 - p0) / p0) * 100;
  var alpha = Math.min(0.2 + pct * 3, 1.0);
  return p1 >= p0
    ? 'rgba(0,200,83,' + alpha.toFixed(2) + ')'
    : 'rgba(255,82,82,' + alpha.toFixed(2) + ')';
}

function segmentFillColor(ctx) {
  var p0 = ctx.p0.parsed.y;
  var p1 = ctx.p1.parsed.y;
  if (p0 == null || p1 == null || p0 === 0) return 'transparent';
  var pct = Math.abs((p1 - p0) / p0) * 100;
  var alpha = Math.min(0.02 + pct * 0.15, 0.12);
  return p1 >= p0
    ? 'rgba(0,200,83,' + alpha.toFixed(3) + ')'
    : 'rgba(255,82,82,' + alpha.toFixed(3) + ')';
}

var segmentStyle = {
  borderColor: function(ctx) { return segmentBorderColor(ctx); },
  backgroundColor: function(ctx) { return segmentFillColor(ctx); }
};

// Shared chart options builder
function chartOptions(xPadding) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e2736', titleColor: '#e4e8ef', bodyColor: '#e4e8ef',
        borderColor: '#2a3548', borderWidth: 1, padding: 10,
        callbacks: { label: function(c) { return c.dataset.label + ': $' + (c.parsed.y != null ? c.parsed.y.toFixed(2) : '--'); } }
      }
    },
    scales: {
      x: { ticks: { color: '#6b7a90', maxRotation: 0, autoSkipPadding: xPadding || 30, font: { size: 9 } }, grid: { color: 'rgba(30,39,54,.6)' } },
      y: { ticks: { color: '#6b7a90', font: { size: 9 }, callback: function(v) { return '$' + v; } }, grid: { color: 'rgba(30,39,54,.6)' } }
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

// Compute delta, % change, % time growing, % time shrinking from a data array
function computeStats(data) {
  var fl = firstLast(data);
  var diff = 0, pct = 0, growing = 0, shrinking = 0, segments = 0;

  if (fl.first !== null && fl.last !== null) {
    diff = fl.last - fl.first;
    pct = fl.first !== 0 ? (diff / fl.first) * 100 : 0;
  }

  for (var i = 1; i < data.length; i++) {
    if (data[i] !== null && data[i - 1] !== null) {
      segments++;
      if (data[i] > data[i - 1]) growing++;
      else if (data[i] < data[i - 1]) shrinking++;
    }
  }

  var growPct = segments > 0 ? (growing / segments) * 100 : 0;
  var shrinkPct = segments > 0 ? (shrinking / segments) * 100 : 0;

  return { diff: diff, pct: pct, growPct: growPct, shrinkPct: shrinkPct, up: diff >= 0 };
}

// Render stats pills into a container element, and update the badge
function renderStats(statsElId, badgeId, stats) {
  var el = $(statsElId);
  if (!el) return;

  var sign = stats.up ? '+' : '';
  el.innerHTML =
    '<span class="stat-pill ' + (stats.up ? 'stat-up' : 'stat-down') + '">' +
      '<span class="stat-label">\u0394</span> ' + sign + stats.diff.toFixed(2) +
    '</span>' +
    '<span class="stat-pill ' + (stats.up ? 'stat-up' : 'stat-down') + '">' +
      sign + stats.pct.toFixed(2) + '%' +
    '</span>' +
    '<span class="stat-pill stat-up">' +
      '<span class="stat-label">\u25B2</span> ' + stats.growPct.toFixed(0) + '%' +
    '</span>' +
    '<span class="stat-pill stat-down">' +
      '<span class="stat-label">\u25BC</span> ' + stats.shrinkPct.toFixed(0) + '%' +
    '</span>';

  if (badgeId) {
    var badge = $(badgeId);
    if (badge) {
      badge.textContent = (stats.up ? '\u25B2' : '\u25BC') + ' ' + Math.abs(stats.pct).toFixed(2) + '%';
      badge.className = 'badge ' + (stats.up ? 'badge-up' : 'badge-down');
    }
  }
}

// ─── Stock Chart (Today) ────────────────────────────
var stockChart;

async function fetchStockWithFallback() {
  var json = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=1d&interval=5m');
  if (json && json.chart && json.chart.result) {
    processStockData(json);
  } else {
    $('stock-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:.8rem;">Unable to load live stock data</div>' +
        '<div style="font-size:.7rem;">Retrying\u2026</div>' +
      '</div>';
    loadDemoStockData();
  }
}

function processStockData(json) {
  var result = json.chart.result[0];
  var meta = result.meta;
  var timestamps = result.timestamp || [];
  var closes = result.indicators.quote[0].close || [];

  var labels = timestamps.map(function(t) {
    return new Date(t * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });
  var data = closes.map(function(c) { return c !== null ? +c.toFixed(2) : null; });

  var price = meta.regularMarketPrice;
  var prevClose = meta.chartPreviousClose || meta.previousClose;
  var diff = price - prevClose;

  // Fallback: if meta reports 0 change, derive from actual chart data
  if (diff === 0 && data.length > 1) {
    var fl = firstLast(data);
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
  var badge = $('stock-badge');
  badge.textContent = (up ? '\u25B2' : '\u25BC') + ' ' + Math.abs(pct) + '%';
  badge.className = 'badge ' + (up ? 'badge-up' : 'badge-down');

  if (meta.fiftyTwoWeekHigh) $('kpi-high').textContent = '$' + meta.fiftyTwoWeekHigh.toFixed(2);
  if (meta.fiftyTwoWeekLow)  $('kpi-low').textContent  = '$' + meta.fiftyTwoWeekLow.toFixed(2);
  if (meta.marketCap) $('kpi-mcap').textContent = '$' + (meta.marketCap / 1e9).toFixed(1) + 'B';

  var stats = computeStats(data);
  renderStats('today-stats', null, stats);

  renderStockChart(labels, data, prevClose);
  $('stock-loader').style.display = 'none';
}

function loadDemoStockData() {
  var basePrice = 62.50;
  var labels = [];
  var data = [];
  var now = new Date();
  now.setHours(9, 30, 0, 0);

  for (var i = 0; i < 78; i++) {
    var t = new Date(now.getTime() + i * 5 * 60000);
    labels.push(t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    var noise = (Math.random() - 0.48) * 0.3;
    var trend = i * 0.008;
    data.push(+(basePrice + trend + noise + Math.sin(i / 10) * 0.4).toFixed(2));
  }

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
  var badge = $('stock-badge');
  badge.textContent = (up ? '\u25B2' : '\u25BC') + ' ' + Math.abs(pct) + '%';
  badge.className = 'badge ' + (up ? 'badge-up' : 'badge-down');

  $('kpi-high').textContent = '$67.42';
  $('kpi-low').textContent  = '$44.50';
  $('kpi-mcap').textContent = '$249.8B';

  var stats = computeStats(data);
  renderStats('today-stats', null, stats);

  renderStockChart(labels, data, prevClose);
}

function renderStockChart(labels, data, prevClose) {
  var dataset = {
    label: 'CSCO', data: data,
    borderColor: 'rgba(107,122,144,0.5)',
    backgroundColor: 'rgba(107,122,144,0.04)',
    segment: segmentStyle,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: true,
  };
  var prevDs = {
    label: 'Prev Close', data: Array(labels.length).fill(prevClose),
    borderColor: 'rgba(107,122,144,.35)', borderWidth: 1, borderDash: [6, 4],
    pointRadius: 0, fill: false,
  };

  if (stockChart) {
    stockChart.data.labels = labels;
    stockChart.data.datasets[0].data = data;
    stockChart.data.datasets[1].data = Array(labels.length).fill(prevClose);
    stockChart.update('none');
  } else {
    var ctx = $('stockChart').getContext('2d');
    stockChart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [dataset, prevDs] },
      options: chartOptions(30)
    });
  }
}

// ─── Range Charts (1 Month, 1 Year, All-Time) ───────
var rangeCharts = {};

var ranges = [
  { id: 'month',   canvasId: 'monthChart',   loaderId: 'month-loader',   statsId: 'month-stats',   badgeId: 'month-badge',   range: '1mo',  interval: '1d',  labelFmt: { month: 'short', day: 'numeric' } },
  { id: 'year',    canvasId: 'yearChart',     loaderId: 'year-loader',    statsId: 'year-stats',    badgeId: 'year-badge',    range: '1y',   interval: '1wk', labelFmt: { year: 'numeric', month: 'short' } },
  { id: 'alltime', canvasId: 'alltimeChart',  loaderId: 'alltime-loader', statsId: 'alltime-stats', badgeId: 'alltime-badge', range: 'max',  interval: '1mo', labelFmt: { year: 'numeric', month: 'short' } },
];

async function fetchRange(cfg) {
  var json = await yahooFetch('https://query1.finance.yahoo.com/v8/finance/chart/CSCO?range=' + cfg.range + '&interval=' + cfg.interval);
  if (json && json.chart && json.chart.result) {
    var result = json.chart.result[0];
    var timestamps = result.timestamp || [];
    var closes = result.indicators.quote[0].close || [];

    var labels = timestamps.map(function(t) {
      return new Date(t * 1000).toLocaleDateString('en-US', cfg.labelFmt);
    });
    var data = closes.map(function(c) { return c !== null ? +c.toFixed(2) : null; });

    var stats = computeStats(data);
    renderStats(cfg.statsId, cfg.badgeId, stats);
    renderRangeChart(cfg, labels, data);
    $(cfg.loaderId).style.display = 'none';
  } else {
    $(cfg.loaderId).innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:.8rem;">Unable to load data</div>' +
        '<div style="font-size:.7rem;color:var(--muted);">Retrying&hellip;</div>' +
      '</div>';
  }
}

function renderRangeChart(cfg, labels, data) {
  var dataset = {
    label: 'CSCO', data: data,
    borderColor: 'rgba(107,122,144,0.5)',
    backgroundColor: 'rgba(107,122,144,0.04)',
    segment: segmentStyle,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: true,
  };

  if (rangeCharts[cfg.id]) {
    var ch = rangeCharts[cfg.id];
    ch.data.labels = labels;
    ch.data.datasets[0].data = data;
    ch.update('none');
  } else {
    var ctx = $(cfg.canvasId).getContext('2d');
    rangeCharts[cfg.id] = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: [dataset] },
      options: chartOptions(40)
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
  return saved ? parseInt(saved, 10) : 30000;
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

function startTimers(ms) {
  if (refreshTimerStock) clearInterval(refreshTimerStock);
  if (refreshTimerRanges) clearInterval(refreshTimerRanges);
  refreshTimerStock = setInterval(fetchStockWithFallback, ms);
  // Range charts refresh at 10x the interval (min 30s) since data changes less often
  var rangeMs = Math.max(ms * 10, 30000);
  refreshTimerRanges = setInterval(fetchAllRanges, rangeMs);
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
fetchStockWithFallback();
fetchAllRanges();
startTimers(getRefreshInterval());
