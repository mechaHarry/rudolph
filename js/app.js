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

// ─── Wallpaper (daily rotation for glass/blur themes) ─
var WALLPAPERS = ['1.jpg','2.jpg','3.jpg','4.jpg','5.jpg','6.jpg'];
var GLASS_THEMES = { oneui: true, glass: true, webex: true, fluent: true };

function getDailyWallpaper() {
  var d = new Date();
  var dayIndex = Math.floor(d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate());
  return 'wallpapers/' + WALLPAPERS[dayIndex % WALLPAPERS.length];
}

function applyWallpaper(themeId) {
  var bgEl = document.querySelector('.wallpaper-bg');
  var tintEl = document.querySelector('.wallpaper-tint');
  var blurStyle = document.getElementById('wp-blur-css');

  if (GLASS_THEMES[themeId]) {
    var wpUrl = getDailyWallpaper();

    if (!bgEl) {
      bgEl = document.createElement('div');
      bgEl.className = 'wallpaper-bg';
      document.body.insertBefore(bgEl, document.body.firstChild);
    }
    if (!tintEl) {
      tintEl = document.createElement('div');
      tintEl.className = 'wallpaper-tint';
      document.body.insertBefore(tintEl, bgEl.nextSibling);
    }
    bgEl.style.backgroundImage = 'url(' + wpUrl + ')';

    if (!blurStyle) {
      blurStyle = document.createElement('style');
      blurStyle.id = 'wp-blur-css';
      document.head.appendChild(blurStyle);
    }
    blurStyle.textContent =
      'body.has-wallpaper .card::after,' +
      'body.has-wallpaper header::after,' +
      'body.has-wallpaper footer::after' +
      '{background-image:url(' + wpUrl + ');}';

    document.body.classList.add('has-wallpaper');
  } else {
    document.body.classList.remove('has-wallpaper');
    if (bgEl) bgEl.remove();
    if (tintEl) tintEl.remove();
    if (blurStyle) blurStyle.remove();
  }
}

// ─── Theme Switcher ──────────────────────────────────
function getThemeColors() {
  var cs = getComputedStyle(document.body);
  var rSm = parseInt(cs.getPropertyValue('--radius-sm'), 10);
  return {
    muted:     cs.getPropertyValue('--muted').trim(),
    text:      cs.getPropertyValue('--text').trim(),
    accent:    cs.getPropertyValue('--accent').trim(),
    surface:   cs.getPropertyValue('--surface').trim(),
    surfaceHi: cs.getPropertyValue('--surface-hi').trim(),
    border:    cs.getPropertyValue('--border').trim(),
    green:     cs.getPropertyValue('--green').trim(),
    red:       cs.getPropertyValue('--red').trim(),
    gridLine:  cs.getPropertyValue('--grid-line').trim(),
    radiusSm:  isNaN(rSm) ? 12 : rSm,
    font:      cs.getPropertyValue('--font').trim(),
    fontMono:  cs.getPropertyValue('--font-mono').trim(),
  };
}

function applyTheme(themeId) {
  var wasReady = document.body.classList.contains('ready');
  document.body.className = themeId === 'oneui' ? '' : 'theme-' + themeId;
  if (wasReady) document.body.classList.add('ready');
  localStorage.setItem('rudolph-theme', themeId);
  applyWallpaper(themeId);

  var sel = $('theme-select');
  if (sel && sel.value !== themeId) sel.value = themeId;

  refreshAllChartColors();
}

function refreshAllChartColors() {
  var tc = getThemeColors();
  var allCharts = [];
  if (hourlyChart) allCharts.push(hourlyChart);
  if (stockChart) allCharts.push(stockChart);
  Object.keys(rangeCharts).forEach(function(k) { allCharts.push(rangeCharts[k]); });

  allCharts.forEach(function(chart) {
    chart.options.scales.x.ticks.color = tc.muted;
    chart.options.scales.x.ticks.font.family = tc.font;
    chart.options.scales.x.grid.color = tc.gridLine;
    chart.options.scales.y.ticks.color = tc.muted;
    chart.options.scales.y.ticks.font.family = tc.fontMono;
    chart.options.scales.y.grid.color = tc.gridLine;
    chart.options.plugins.tooltip.backgroundColor = tc.surfaceHi;
    chart.options.plugins.tooltip.titleColor = tc.text;
    chart.options.plugins.tooltip.bodyColor = tc.text;
    chart.options.plugins.tooltip.borderColor = tc.border;
    chart.options.plugins.tooltip.cornerRadius = tc.radiusSm;
    chart.options.plugins.tooltip.titleFont.family = tc.font;
    chart.options.plugins.tooltip.bodyFont.family = tc.fontMono;

    chart.data.datasets.forEach(function(ds) {
      if (ds.label === 'Prior') {
        ds.borderColor = ghostBorderColor();
      }
    });

    chart.update('none');
  });
}

// Theme init merged into the button DOMContentLoaded listener below

// ─── Ticker Management ──────────────────────────────
var currentTicker = localStorage.getItem('rudolph-ticker') || 'CSCO';
var savedTickers = JSON.parse(
  localStorage.getItem('rudolph-tickers') || '[{"sym":"CSCO","name":"Cisco Systems, Inc."}]'
);

function saveTickers() {
  localStorage.setItem('rudolph-tickers', JSON.stringify(savedTickers));
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chartUrl(params) {
  return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(currentTicker) + '?' + params;
}

function renderTickerList(searchResults) {
  var el = $('ticker-list');
  var html = '';

  if (searchResults && searchResults.length) {
    html += '<div class="ticker-section-label">Results</div>';
    for (var i = 0; i < searchResults.length; i++) {
      var r = searchResults[i];
      var already = savedTickers.some(function(t) { return t.sym === r.symbol; });
      html += '<div class="ticker-item" data-sym="' + esc(r.symbol) + '" data-name="' + esc(r.shortname || r.symbol) + '" data-action="add">' +
        '<span class="ticker-item-sym">' + esc(r.symbol) + '</span>' +
        '<span class="ticker-item-name">' + esc(r.shortname || r.longname || '') + '</span>' +
        (r.exchDisp ? '<span class="ticker-item-exch">' + esc(r.exchDisp) + '</span>' : '') +
        (already
          ? '<span class="ticker-item-check">\u2713</span>'
          : '<button class="ticker-item-action add" type="button">+</button>') +
      '</div>';
    }
    html += '<div class="ticker-divider"></div>';
  }

  if (savedTickers.length) {
    html += '<div class="ticker-section-label">Watchlist</div>';
    for (var j = 0; j < savedTickers.length; j++) {
      var t = savedTickers[j];
      var isActive = t.sym === currentTicker;
      html += '<div class="ticker-item' + (isActive ? ' active' : '') + '" data-sym="' + esc(t.sym) + '" data-name="' + esc(t.name) + '" data-action="select">' +
        '<span class="ticker-item-sym">' + esc(t.sym) + '</span>' +
        '<span class="ticker-item-name">' + esc(t.name) + '</span>' +
        (!isActive ? '<button class="ticker-item-action remove" data-action="remove" type="button">\u00d7</button>' : '') +
      '</div>';
    }
  }

  el.innerHTML = html || '<div class="ticker-empty">Type to search stocks</div>';
}

var tickerSearchTimer = null;

async function searchTickers(query) {
  var url = 'https://query1.finance.yahoo.com/v1/finance/search?q=' +
    encodeURIComponent(query) + '&quotesCount=8&newsCount=0';
  var json = await yahooFetch(url);
  if (json && json.quotes) {
    var filtered = json.quotes.filter(function(r) {
      return r.quoteType === 'EQUITY' || r.quoteType === 'ETF' || r.quoteType === 'INDEX';
    });
    renderTickerList(filtered);
  }
}

function addTicker(sym, name) {
  if (!savedTickers.some(function(t) { return t.sym === sym; })) {
    savedTickers.push({ sym: sym, name: name });
    saveTickers();
  }
  selectTicker(sym);
}

function removeTicker(sym) {
  if (sym === currentTicker) return;
  savedTickers = savedTickers.filter(function(t) { return t.sym !== sym; });
  saveTickers();
  renderTickerList();
}

function selectTicker(sym) {
  if (sym === currentTicker) {
    $('ticker-panel').classList.remove('open');
    return;
  }
  currentTicker = sym;
  localStorage.setItem('rudolph-ticker', sym);
  $('ticker-btn').textContent = sym;
  $('ticker-panel').classList.remove('open');
  resetDashboard();
}

function resetDashboard() {
  if (hourlyChart)  { hourlyChart.destroy(); hourlyChart = null; }
  if (stockChart)   { stockChart.destroy();  stockChart = null; }
  Object.keys(rangeCharts).forEach(function(k) { rangeCharts[k].destroy(); });
  rangeCharts = {};
  megaData = null;

  ['hourly-loader','stock-loader','month-loader','year-loader','alltime-loader'].forEach(function(id) {
    var el = $(id);
    el.style.display = '';
    el.className = 'skel skel-chart';
    el.innerHTML = '';
  });

  var pills7 = new Array(8).join('<span class="skel skel-pill"></span>');
  var pills6 = new Array(7).join('<span class="skel skel-pill"></span>');
  ['hourly-stats','today-stats','month-stats','year-stats'].forEach(function(id) { $(id).innerHTML = pills7; });
  $('alltime-stats').innerHTML = pills6;

  $('stock-price').innerHTML  = '<span class="skel skel-price"></span>';
  $('stock-change').innerHTML = '<span class="skel skel-change"></span>';

  fetchMegaData();
  fetchHourly();
  fetchStockWithFallback();
  fetchAllRanges();
}

function positionTickerPanel() {
  var btn = $('ticker-btn');
  var panel = $('ticker-panel');
  if (!btn || !panel) return;
  var r = btn.getBoundingClientRect();
  panel.style.left = r.left + 'px';
  panel.style.top = (r.bottom + 6) + 'px';
  panel.style.minWidth = Math.max(r.width, 300) + 'px';
}

function initTickerCombo() {
  $('ticker-btn').textContent = currentTicker;

  var panel = $('ticker-panel');
  if (panel && panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  $('ticker-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    var p = $('ticker-panel');
    var opening = !p.classList.contains('open');
    p.classList.toggle('open');
    if (opening) {
      positionTickerPanel();
      $('ticker-search').value = '';
      renderTickerList();
      setTimeout(function() { $('ticker-search').focus(); }, 50);
    }
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#ticker-combo') && !e.target.closest('#ticker-panel')) {
      $('ticker-panel').classList.remove('open');
    }
  });

  $('ticker-search').addEventListener('input', function() {
    var q = this.value.trim();
    clearTimeout(tickerSearchTimer);
    if (q.length < 1) { renderTickerList(); return; }
    tickerSearchTimer = setTimeout(function() { searchTickers(q); }, 250);
  });

  $('ticker-search').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var first = $('ticker-list').querySelector('.ticker-item[data-action="add"]');
      if (first) addTicker(first.dataset.sym, first.dataset.name);
    }
  });

  $('ticker-list').addEventListener('click', function(e) {
    var removeBtn = e.target.closest('.remove');
    if (removeBtn) {
      var item = removeBtn.closest('.ticker-item');
      if (item) removeTicker(item.dataset.sym);
      return;
    }

    var addBtn = e.target.closest('.add');
    var item = e.target.closest('.ticker-item');
    if (!item) return;

    if (addBtn || item.dataset.action === 'add') {
      addTicker(item.dataset.sym, item.dataset.name);
    } else {
      selectTicker(item.dataset.sym);
    }
  });
}

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
  if (p0 == null || p1 == null) return 'rgba(138,150,170,0.3)';
  var cs = getComputedStyle(document.body);
  return p1 >= p0 ? cs.getPropertyValue('--green').trim() : cs.getPropertyValue('--red').trim();
}

function segmentFillColor(ctx) {
  var p0 = ctx.p0.parsed.y;
  var p1 = ctx.p1.parsed.y;
  if (p0 == null || p1 == null) return 'transparent';
  var cs = getComputedStyle(document.body);
  var c = p1 >= p0 ? cs.getPropertyValue('--green').trim() : cs.getPropertyValue('--red').trim();
  var m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) return 'rgba(' + parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16) + ',0.12)';
  return c.replace('rgb(', 'rgba(').replace(')', ',0.12)');
}

var segmentStyle = {
  borderColor: function(ctx) { return segmentBorderColor(ctx); },
  backgroundColor: function(ctx) { return segmentFillColor(ctx); }
};

// ─── Mega dataset: all-time daily OHLC for accurate min/max ──
var megaData = null; // { timestamps:[], highs:[], lows:[], closes:[] }

async function fetchMegaData() {
  var json = await yahooFetch(chartUrl('range=max&interval=1d'));
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

function getBounds(daysBack, dataArrays) {
  var lo = Infinity, hi = -Infinity;

  var s = sliceMega(daysBack);
  if (s) { lo = s.min; hi = s.max; }

  for (var i = 0; i < dataArrays.length; i++) {
    var arr = dataArrays[i];
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
  var tc = getThemeColors();
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tc.surfaceHi, titleColor: tc.text, bodyColor: tc.text,
        borderColor: tc.border, borderWidth: 1, padding: 12,
        cornerRadius: tc.radiusSm,
        titleFont: { size: 12, weight: '600', family: tc.font },
        bodyFont: { size: 12, family: tc.fontMono },
        callbacks: { label: function(c) { return c.dataset.label + ': $' + (c.parsed.y != null ? c.parsed.y.toFixed(2) : '--'); } }
      }
    },
    scales: {
      x: { ticks: { color: tc.muted, maxRotation: 0, autoSkipPadding: xPadding || 30, font: { size: 10, family: tc.font } }, grid: { color: tc.gridLine } },
      y: {
        ticks: { color: tc.muted, font: { size: 10, family: tc.fontMono }, callback: function(v) { return '$' + (v >= 100 ? Math.round(v) : v.toFixed(2)); } },
        grid: { color: tc.gridLine }
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
function ghostBorderColor() {
  var accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
  var m = accent.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) return 'rgba(' + parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16) + ',0.45)';
  return accent.replace('rgb(', 'rgba(').replace(')', ',0.45)');
}

function makeGhostDs(priorData) {
  return {
    label: 'Prior', data: priorData,
    borderColor: ghostBorderColor(),
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0.3,
    fill: false,
  };
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
  var json = await yahooFetch(chartUrl('range=1d&interval=1m'));
  if (json && json.chart && json.chart.result) {
    processHourlyData(json);
  } else {
    $('hourly-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:13px;">Unable to load live stock data</div>' +
        '<div style="font-size:12px;color:var(--muted);">Retrying\u2026</div>' +
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

  var stats = computeStats(data, 1);
  renderStats('hourly-stats', stats, true);

  updateNoseColor(up);
  renderHourlyChart(labels, data, prevClose, priorData);
}

function renderHourlyChart(labels, data, prevClose, priorData) {
  var dataset = {
    label: currentTicker, data: data,
    borderColor: 'rgba(138,150,170,0.4)',
    backgroundColor: 'rgba(138,150,170,0.08)',
    segment: segmentStyle,
    borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, tension: 0.3, fill: true,
  };
  var prevDs = {
    label: 'Prev Close', data: Array(labels.length).fill(prevClose),
    borderColor: 'rgba(138,150,170,.25)', borderWidth: 1, borderDash: [6, 4],
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
  var json = await yahooFetch(chartUrl('range=5d&interval=1m'));
  if (json && json.chart && json.chart.result) {
    processStockData(json);
  } else {
    $('stock-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:13px;">Unable to load data</div>' +
        '<div style="font-size:12px;color:var(--muted);">Retrying\u2026</div>' +
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
    label: currentTicker, data: data,
    borderColor: 'rgba(138,150,170,0.4)',
    backgroundColor: 'rgba(138,150,170,0.08)',
    segment: segmentStyle,
    borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, tension: 0.3, fill: true,
  };
  var prevDs = {
    label: 'Prev Close', data: Array(labels.length).fill(prevClose),
    borderColor: 'rgba(138,150,170,.25)', borderWidth: 1, borderDash: [6, 4],
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
  { id: 'month',   canvasId: 'monthChart',   loaderId: 'month-loader',   statsId: 'month-stats',   range: '3mo',  interval: '1d',  labelFmt: { month: 'short', day: 'numeric' }, hasPrior: true,  showDays: 30,  megaDays: 90 },
  { id: 'year',    canvasId: 'yearChart',     loaderId: 'year-loader',    statsId: 'year-stats',    range: '2y',   interval: '1d',  labelFmt: { year: 'numeric', month: 'short' }, hasPrior: true,  showDays: 365, megaDays: 730 },
  { id: 'alltime', canvasId: 'alltimeChart',  loaderId: 'alltime-loader', statsId: 'alltime-stats', range: 'max',  interval: '1mo', labelFmt: { year: 'numeric', month: 'short' }, hasPrior: false, showDays: 0,   megaDays: 0 },
];

async function fetchRange(cfg) {
  var json = await yahooFetch(chartUrl('range=' + cfg.range + '&interval=' + cfg.interval));
  if (json && json.chart && json.chart.result) {
    var result = json.chart.result[0];
    var timestamps = result.timestamp || [];
    var closes = result.indicators.quote[0].close || [];

    var allLabels = timestamps.map(function(t) {
      return new Date(t * 1000).toLocaleDateString('en-US', cfg.labelFmt);
    });
    var allData = closes.map(function(c) { return c !== null ? +c.toFixed(2) : null; });

    var labels, data, priorData = null;
    if (cfg.hasPrior && cfg.showDays > 0) {
      var cutoffTs = Math.floor(Date.now() / 1000) - cfg.showDays * 86400;
      var cutIdx = timestamps.length;
      for (var k = 0; k < timestamps.length; k++) {
        if (timestamps[k] >= cutoffTs) { cutIdx = k; break; }
      }
      priorData = allData.slice(0, cutIdx);
      data = allData.slice(cutIdx);
      labels = allLabels.slice(cutIdx);
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
        '<div style="color:var(--red);margin-bottom:6px;font-size:13px;">Unable to load data</div>' +
        '<div style="font-size:12px;color:var(--muted);">Retrying&hellip;</div>' +
      '</div>';
  }
}

function renderRangeChart(cfg, labels, data, priorData) {
  var dataset = {
    label: currentTicker, data: data,
    borderColor: 'rgba(138,150,170,0.4)',
    backgroundColor: 'rgba(138,150,170,0.08)',
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

var REFRESH_MS = 1000;
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

document.addEventListener('DOMContentLoaded', function() {
  var savedTheme = localStorage.getItem('rudolph-theme') || 'oneui';
  applyTheme(savedTheme);
  var themeSel = $('theme-select');
  if (themeSel) {
    themeSel.addEventListener('change', function() { applyTheme(this.value); });
  }

  initTickerCombo();

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      document.body.classList.add('ready');
    });
  });
});

// ─── Init ────────────────────────────────────────────
fetchMegaData();
fetchHourly();
fetchStockWithFallback();
fetchAllRanges();
startTimers(REFRESH_MS);
