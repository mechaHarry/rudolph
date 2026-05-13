// ─── Utility ─────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };

function yieldFrame() {
  return new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
}

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


// ─── Theme Switcher ──────────────────────────────────
function getThemeColors() {
  var cs = getComputedStyle(document.body);
  var rSm = parseInt(cs.getPropertyValue('--radius-sm'), 10);
  return {
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

// ─── External tooltip handler (frosted glass) ───────
var _tooltipEl = null;

function getTooltipEl() {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'chart-tooltip';
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

function externalTooltipHandler(context) {
  var tooltip = context.tooltip;
  var el = getTooltipEl();

  if (tooltip.opacity === 0) {
    el.classList.remove('visible');
    return;
  }

  var titleLines = tooltip.title || [];
  var bodyLines = tooltip.body ? tooltip.body.map(function(b) { return b.lines; }) : [];

  var html = '';
  if (titleLines.length) {
    html += '<div class="tt-title">' + esc(titleLines.join(' ')) + '</div>';
  }
  html += '<div class="tt-body">';
  bodyLines.forEach(function(lines, i) {
    var color = tooltip.labelColors && tooltip.labelColors[i]
      ? tooltip.labelColors[i].borderColor : 'var(--accent)';
    lines.forEach(function(line) {
      html += '<div class="tt-row"><span class="tt-swatch" style="background:' + color + '"></span>' + esc(line) + '</div>';
    });
  });
  html += '</div>';
  el.innerHTML = html;

  var canvasRect = context.chart.canvas.getBoundingClientRect();
  var left = canvasRect.left + tooltip.caretX + 12;
  var top = canvasRect.top + tooltip.caretY;
  var elW = el.offsetWidth;
  var elH = el.offsetHeight;
  if (left + elW > window.innerWidth - 8) left = left - elW - 24;
  if (top + elH > window.innerHeight - 8) top = window.innerHeight - elH - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.classList.add('visible');
}

function applyTheme(themeId) {
  var wasReady = document.body.classList.contains('ready');
  document.body.className = themeId === 'oneui' ? '' : 'theme-' + themeId;
  if (wasReady) document.body.classList.add('ready');
  localStorage.setItem('rudolph-theme', themeId);

  var sel = $('theme-select');
  if (sel && sel.value !== themeId) sel.value = themeId;

  refreshAllChartColors();
  syncGridToTheme();
}

function refreshAllChartColors() {
  var tc = getThemeColors();
  var allCharts = [];
  if (hourlyChart) allCharts.push(hourlyChart);
  if (stockChart) allCharts.push(stockChart);
  Object.keys(rangeCharts).forEach(function(k) { allCharts.push(rangeCharts[k]); });

  allCharts.forEach(function(chart) {
    chart.options.scales.x.ticks.color = tc.text;
    chart.options.scales.x.ticks.font.family = tc.font;
    chart.options.scales.x.grid.color = tc.gridLine;
    chart.options.scales.y.ticks.color = tc.text;
    chart.options.scales.y.ticks.font.family = tc.fontMono;
    chart.options.scales.y.grid.color = tc.gridLine;
    chart.options.plugins.tooltip.enabled = false;
    chart.options.plugins.tooltip.external = externalTooltipHandler;

    chart.data.datasets.forEach(function(ds) {
      if (ds.label === 'Prior') {
        ds.borderColor = ghostBorderColor();
      } else if (ds.label === 'Extended Hours') {
        ds.borderColor = afterHoursColor();
        ds.backgroundColor = colorToRgba(ds.borderColor, 0.16);
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
function wait(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function fetchJsonWithBackoff(url, attempts) {
  var baseDelay = 250;
  for (var i = 0; i < attempts; i++) {
    try {
      var res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* try again below */ }
    if (i < attempts - 1) await wait(baseDelay * Math.pow(2, i));
  }
  return null;
}

async function yahooFetch(url) {
  var direct = await fetchJsonWithBackoff(url, 2);
  if (direct) return direct;

  // Fallback for non-extension contexts
  var proxy = 'https://corsproxy.io/?' + encodeURIComponent(url);
  return fetchJsonWithBackoff(proxy, 2);
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
        enabled: false,
        external: externalTooltipHandler,
        callbacks: { label: function(c) { return c.dataset.label + ': $' + (c.parsed.y != null ? c.parsed.y.toFixed(2) : '--'); } }
      }
    },
    scales: {
      x: { ticks: { color: tc.text, maxRotation: 0, autoSkipPadding: xPadding || 30, font: { size: 12, family: tc.font } }, grid: { color: tc.gridLine } },
      y: {
        ticks: { color: tc.text, font: { size: 12, family: tc.fontMono }, callback: function(v) { return '$' + (v >= 100 ? Math.round(v) : v.toFixed(2)); } },
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

var REGULAR_MARKET_START_MINUTES = 9 * 60 + 30;
var REGULAR_MARKET_END_MINUTES = 16 * 60;

function normalizePrice(value) {
  var n = Number(value);
  return isFinite(n) ? +n.toFixed(2) : null;
}

function hasPriceData(data) {
  if (!data) return false;
  for (var i = 0; i < data.length; i++) {
    if (data[i] !== null && data[i] !== undefined && isFinite(data[i])) return true;
  }
  return false;
}

function lastPrice(data) {
  if (!data) return null;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i] !== null && data[i] !== undefined && isFinite(data[i])) return data[i];
  }
  return null;
}

function lastPoint(data) {
  if (!data) return { index: -1, value: null };
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i] !== null && data[i] !== undefined && isFinite(data[i])) {
      return { index: i, value: data[i] };
    }
  }
  return { index: -1, value: null };
}

function exchangeMinutes(timestamp, gmtoffset) {
  var exchangeDate = new Date((timestamp + (gmtoffset || 0)) * 1000);
  return exchangeDate.getUTCHours() * 60 + exchangeDate.getUTCMinutes();
}

function isRegularMarketTimestamp(timestamp, gmtoffset) {
  var minutes = exchangeMinutes(timestamp, gmtoffset);
  return minutes >= REGULAR_MARKET_START_MINUTES && minutes < REGULAR_MARKET_END_MINUTES;
}

function splitIntradaySeries(timestamps, closes, gmtoffset) {
  var regular = [];
  var extended = [];
  var combined = [];
  var hasExtended = false;

  for (var i = 0; i < timestamps.length; i++) {
    var price = normalizePrice(closes[i]);
    combined.push(price);

    if (price === null) {
      regular.push(null);
      extended.push(null);
      continue;
    }

    if (isRegularMarketTimestamp(timestamps[i], gmtoffset)) {
      regular.push(price);
      extended.push(null);
    } else {
      regular.push(null);
      extended.push(price);
      hasExtended = true;
    }
  }

  return {
    regular: regular,
    extended: extended,
    combined: combined,
    hasExtended: hasExtended
  };
}

function afterHoursColor() {
  var color = getComputedStyle(document.body).getPropertyValue('--after-hours').trim();
  return color || '#f5b642';
}

function colorToRgba(color, alpha) {
  var m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) return 'rgba(' + parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16) + ',' + alpha + ')';
  var rgb = color.match(/^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)$/i);
  if (rgb) return 'rgba(' + rgb[1] + ',' + rgb[2] + ',' + rgb[3] + ',' + alpha + ')';
  return color;
}

function makeExtendedHoursDs(extendedData) {
  var color = afterHoursColor();
  return {
    label: 'Extended Hours', data: extendedData,
    borderColor: color,
    backgroundColor: colorToRgba(color, 0.16),
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0.3,
    fill: true,
  };
}

function buildIntradayDatasets(args) {
  var dataset = {
    label: currentTicker, data: args.regularData,
    borderColor: 'rgba(138,150,170,0.4)',
    backgroundColor: 'rgba(138,150,170,0.08)',
    segment: segmentStyle,
    borderWidth: 3, pointRadius: 0, pointHoverRadius: 3, tension: 0.3, fill: true,
  };
  var prevDs = {
    label: 'Prev Close', data: Array(args.labels.length).fill(args.prevClose),
    borderColor: 'rgba(138,150,170,.25)', borderWidth: 1, borderDash: [6, 4],
    pointRadius: 0, fill: false,
  };
  var datasets = [dataset];
  if (hasPriceData(args.extendedData)) datasets.push(makeExtendedHoursDs(args.extendedData));
  datasets.push(prevDs);
  if (args.priorData) datasets.push(makeGhostDs(args.priorData));
  return datasets;
}

function getSessionQuote(meta, data, extendedData) {
  var state = String(meta.marketState || '').toUpperCase();
  var regularPrice = normalizePrice(meta.regularMarketPrice);
  var price = regularPrice;
  var extendedPrice = null;
  var extendedLabel = '';
  var session = 'today';
  var latestExtended = lastPoint(extendedData);

  if (state.indexOf('PRE') === 0) {
    var prePrice = normalizePrice(meta.preMarketPrice);
    var fallbackPrePrice = prePrice !== null ? prePrice : latestExtended.value;
    if (fallbackPrePrice !== null) {
      price = fallbackPrePrice;
      extendedPrice = fallbackPrePrice;
      extendedLabel = 'Pre';
      session = 'pre-market';
    }
  } else if (state.indexOf('POST') === 0 || state === 'CLOSED') {
    var postPrice = normalizePrice(meta.postMarketPrice);
    var fallbackPostPrice = postPrice !== null ? postPrice : latestExtended.value;
    if (fallbackPostPrice !== null) {
      price = fallbackPostPrice;
      extendedPrice = fallbackPostPrice;
      extendedLabel = 'AH';
      session = 'after hours';
    }
  } else if (latestExtended.value !== null && latestExtended.index === lastPoint(data).index) {
    var latestExtendedPrice = latestExtended.value;
    if (latestExtendedPrice !== null) {
      var label = regularPrice === null ? 'Ext' : 'AH';
      price = latestExtendedPrice;
      extendedPrice = latestExtendedPrice;
      extendedLabel = label;
      session = label === 'AH' ? 'after hours' : 'extended hours';
    }
  }

  if (price === null) price = lastPrice(data);
  if (regularPrice === null) regularPrice = price;
  return {
    price: price,
    regularPrice: regularPrice,
    extendedPrice: extendedPrice,
    extendedLabel: extendedLabel,
    session: session
  };
}

function buildHeaderPriceHtml(quote) {
  var mainPrice = quote.regularPrice !== null && quote.regularPrice !== undefined
    ? quote.regularPrice
    : quote.price;
  var html = '$' + mainPrice.toFixed(2);
  if (quote.extendedPrice !== null && quote.extendedPrice !== undefined) {
    html += '<span class="extended-price">' +
      esc(quote.extendedLabel) + ' $' + quote.extendedPrice.toFixed(2) +
    '</span>';
  }
  return html;
}

function renderHeaderPrice(quote) {
  $('stock-price').innerHTML = buildHeaderPriceHtml(quote);
}

// ─── Hour Chart (last 60 minutes) ────────────────────
var hourlyChart;

async function fetchHourly() {
  var json = await yahooFetch(chartUrl('range=1d&interval=1m&includePrePost=true'));
  if (json && json.chart && json.chart.result) {
    processHourlyData(json);
  } else {
    $('hourly-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:13px;">Unable to load live stock data</div>' +
        '<div style="font-size:12px;color:var(--text);">Retrying\u2026</div>' +
      '</div>';
    loadDemoHourlyData();
  }
}

async function processHourlyData(json) {
  var result = json.chart.result[0];
  var meta = result.meta;
  var timestamps = result.timestamp || [];
  var closes = result.indicators.quote[0].close || [];
  var series = splitIntradaySeries(timestamps, closes, meta.gmtoffset || 0);

  var allLabels = timestamps.map(function(t) {
    return new Date(t * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });
  var allData = series.combined;
  var allRegularData = series.regular;
  var allExtendedData = series.extended;

  var n = allData.length;
  var cutoff = Math.max(0, n - 60);
  var labels = allLabels.slice(cutoff);
  var data = allRegularData.slice(cutoff);
  var extendedData = allExtendedData.slice(cutoff);
  var combinedData = allData.slice(cutoff);

  var priorStart = Math.max(0, cutoff - 60);
  var priorData = padAlign(allData.slice(priorStart, cutoff), data.length);

  var quote = getSessionQuote(meta, allData, allExtendedData);
  var price = quote.price;
  var prevClose = meta.chartPreviousClose || meta.previousClose;
  var diff = price - prevClose;

  if (diff === 0 && combinedData.length > 1) {
    var fl = firstLast(combinedData);
    if (fl.first !== null && fl.last !== null) {
      diff = fl.last - fl.first;
      price = fl.last;
      prevClose = fl.first;
    }
  }

  var pct = prevClose ? ((diff / prevClose) * 100).toFixed(2) : '0.00';
  var up = diff >= 0;

  renderHeaderPrice(quote);
  $('stock-change').innerHTML =
    '<span style="color:' + (up ? 'var(--green)' : 'var(--red)') + '">' +
      (up ? '+' : '') + diff.toFixed(2) + ' (' + (up ? '+' : '') + pct + '%) ' + quote.session +
    '</span>';

  var stats = computeStats(combinedData, 1);
  renderStats('hourly-stats', stats, true);
  updateNoseColor(up);

  await yieldFrame();
  renderHourlyChart(labels, data, prevClose, priorData, extendedData);
  $('hourly-loader').style.display = 'none';
  markChartLoaded('hourly');
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
    '</span> <span style="color:var(--text);">(demo)</span>';

  var stats = computeStats(data, 1);
  renderStats('hourly-stats', stats, true);

  updateNoseColor(up);
  renderHourlyChart(labels, data, prevClose, priorData);
  $('hourly-loader').style.display = 'none';
  markChartLoaded('hourly');
}

function renderHourlyChart(labels, data, prevClose, priorData, extendedData) {
  var datasets = buildIntradayDatasets({
    labels: labels,
    regularData: data,
    extendedData: extendedData,
    prevClose: prevClose,
    priorData: priorData
  });

  var bounds = getBounds(1, [data, extendedData, priorData]);

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
  var json = await yahooFetch(chartUrl('range=5d&interval=1m&includePrePost=true'));
  if (json && json.chart && json.chart.result) {
    processStockData(json);
  } else {
    $('stock-loader').innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:13px;">Unable to load data</div>' +
        '<div style="font-size:12px;color:var(--text);">Retrying\u2026</div>' +
      '</div>';
  }
}

async function processStockData(json) {
  var result = json.chart.result[0];
  var meta = result.meta;
  var timestamps = result.timestamp || [];
  var closes = result.indicators.quote[0].close || [];
  var series = splitIntradaySeries(timestamps, closes, meta.gmtoffset || 0);

  var byDate = {};
  for (var i = 0; i < timestamps.length; i++) {
    var d = new Date(timestamps[i] * 1000);
    var dateKey = d.toDateString();
    if (!byDate[dateKey]) byDate[dateKey] = { labels: [], regular: [], extended: [], combined: [] };
    byDate[dateKey].labels.push(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    byDate[dateKey].regular.push(series.regular[i]);
    byDate[dateKey].extended.push(series.extended[i]);
    byDate[dateKey].combined.push(series.combined[i]);
  }

  var dates = Object.keys(byDate).sort(function(a, b) { return new Date(a) - new Date(b); });
  var cur = byDate[dates[dates.length - 1]] || { labels: [], regular: [], extended: [], combined: [] };
  var prev = dates.length >= 2 ? byDate[dates[dates.length - 2]] : null;

  var labels = cur.labels;
  var data = cur.regular;
  var extendedData = cur.extended;
  var combinedData = cur.combined;
  var priorData = prev ? padAlign(prev.combined, combinedData.length) : null;

  var prevClose = meta.chartPreviousClose || meta.previousClose;
  var stats = computeStats(combinedData, 2);
  renderStats('today-stats', stats, true);

  await yieldFrame();
  renderStockChart(labels, data, prevClose, priorData, extendedData);
  $('stock-loader').style.display = 'none';
  markChartLoaded('stock');
}

function renderStockChart(labels, data, prevClose, priorData, extendedData) {
  var datasets = buildIntradayDatasets({
    labels: labels,
    regularData: data,
    extendedData: extendedData,
    prevClose: prevClose,
    priorData: priorData
  });

  var bounds = getBounds(2, [data, extendedData, priorData]);

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
    await yieldFrame();
    renderRangeChart(cfg, labels, data, priorData);
    $(cfg.loaderId).style.display = 'none';
    markChartLoaded(cfg.id);
  } else {
    $(cfg.loaderId).innerHTML =
      '<div style="text-align:center;line-height:1.5">' +
        '<div style="color:var(--red);margin-bottom:6px;font-size:13px;">Unable to load data</div>' +
        '<div style="font-size:12px;color:var(--text);">Retrying&hellip;</div>' +
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

// ─── Loader dismiss ──────────────────────────────────
var _loaderDismissed = false;
var _chartsLoaded = {};

function markChartLoaded(id) {
  _chartsLoaded[id] = true;
  var needed = ['hourly', 'stock', 'month', 'year', 'alltime'];
  for (var i = 0; i < needed.length; i++) {
    if (!_chartsLoaded[needed[i]]) return;
  }
  dismissLoader();
}

function dismissLoader() {
  if (_loaderDismissed) return;
  _loaderDismissed = true;
  var el = $('loader');
  if (!el) return;
  el.classList.add('fade-out');
  el.addEventListener('transitionend', function() { el.remove(); });
  setTimeout(function() { el.remove(); }, 600);
}

// ─── Gridstack Dashboard ─────────────────────────────
var GRID_STORAGE_KEY = 'rudolph-grid-layout';
var GRID_VERSION = 5;
var dashGrid = null;

var DEFAULT_LAYOUT = [
  { id: 'hourly',  x: 0, y: 0, w: 12, h: 3 },
  { id: 'stock',   x: 0, y: 3, w: 6,  h: 3 },
  { id: 'month',   x: 6, y: 3, w: 6,  h: 3 },
  { id: 'year',    x: 0, y: 6, w: 6,  h: 3 },
  { id: 'alltime', x: 6, y: 6, w: 6,  h: 3 },
];

function saveGridLayout() {
  if (!dashGrid) return;
  var nodes = dashGrid.engine.nodes;
  var items = nodes.map(function(n) {
    return { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h };
  });
  localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify({ v: GRID_VERSION, items: items }));
}

function loadGridLayout() {
  try {
    var raw = localStorage.getItem(GRID_STORAGE_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (data && data.v === GRID_VERSION && Array.isArray(data.items)) return data.items;
    localStorage.removeItem(GRID_STORAGE_KEY);
  } catch (e) {
    localStorage.removeItem(GRID_STORAGE_KEY);
  }
  return null;
}

function resizeAllCharts() {
  [hourlyChart, stockChart].forEach(function(c) { if (c) c.resize(); });
  Object.keys(rangeCharts).forEach(function(k) { if (rangeCharts[k]) rangeCharts[k].resize(); });
}

function getThemeGap() {
  var v = getComputedStyle(document.body).getPropertyValue('--gap-grid').trim();
  return parseInt(v, 10) || 8;
}

function getMaxRow(layout) {
  if (!layout) layout = DEFAULT_LAYOUT;
  var max = 0;
  layout.forEach(function(n) { max = Math.max(max, (n.y || 0) + (n.h || 1)); });
  return max || 9;
}

function computeCellH(rows) {
  var hdr = document.querySelector('header');
  var ftr = document.querySelector('footer');
  var avail = window.innerHeight - (hdr ? hdr.offsetHeight : 0) - (ftr ? ftr.offsetHeight : 0);
  return Math.max(30, avail / rows);
}

function fitGridToViewport() {
  if (!dashGrid) return;
  var m = Math.round(getThemeGap() / 2);
  var nodes = dashGrid.engine.nodes;
  var rows = getMaxRow(nodes.length ? nodes : null);
  var ch = computeCellH(rows);
  dashGrid.batchUpdate();
  dashGrid.margin(m);
  dashGrid.cellHeight(ch);
  dashGrid.opts.maxRow = rows;
  dashGrid.engine.maxRow = rows;
  dashGrid.batchUpdate(false);
  setTimeout(resizeAllCharts, 60);
}

function syncGridToTheme() {
  fitGridToViewport();
}

function initDashboardGrid() {
  var el = document.getElementById('dashboard-grid');
  if (!el) { console.warn('Grid element not found'); return; }
  if (typeof GridStack === 'undefined') { console.warn('GridStack not loaded'); return; }

  var saved = loadGridLayout();
  var layout = (saved && saved.length) ? saved : DEFAULT_LAYOUT;

  layout.forEach(function(item) {
    var node = el.querySelector('[gs-id="' + item.id + '"]');
    if (node) {
      node.setAttribute('gs-x', item.x != null ? item.x : 0);
      node.setAttribute('gs-y', item.y != null ? item.y : 0);
      node.setAttribute('gs-w', item.w != null ? item.w : 6);
      node.setAttribute('gs-h', item.h != null ? item.h : 3);
    }
  });

  var gap = getThemeGap();
  var m = Math.round(gap / 2);
  var rows = getMaxRow(layout);
  var ch = computeCellH(rows);

  try {
    dashGrid = GridStack.init({
      column: 12,
      cellHeight: ch,
      maxRow: rows,
      margin: m,
      animate: true,
      float: false,
      handle: '.card-header',
      resizable: { handles: 'e,se,s,sw,w' },
    }, el);
  } catch (e) {
    console.error('GridStack.init() threw:', e);
    return;
  }

  if (!dashGrid) { console.error('GridStack.init() returned null'); return; }

  dashGrid.on('change', function() {
    saveGridLayout();
    setTimeout(resizeAllCharts, 60);
  });
  dashGrid.on('resizestop', function() { setTimeout(resizeAllCharts, 60); });
  dashGrid.on('dragstop', function() { setTimeout(resizeAllCharts, 60); });

  setTimeout(fitGridToViewport, 100);

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitGridToViewport, 150);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var savedTheme = localStorage.getItem('rudolph-theme') || 'oneui';
  applyTheme(savedTheme);
  var themeSel = $('theme-select');
  if (themeSel) {
    themeSel.addEventListener('change', function() { applyTheme(this.value); });
  }

  initTickerCombo();
  initDashboardGrid();
  document.body.style.background = '';

  var resetBtn = $('reset-layout-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      localStorage.removeItem(GRID_STORAGE_KEY);
      location.reload();
    });
  }

  setTimeout(dismissLoader, 6000);
});

// ─── Init ────────────────────────────────────────────
function initApp() {
  fetchMegaData();
  fetchHourly();
  fetchStockWithFallback();
  fetchAllRanges();
  startTimers(REFRESH_MS);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildIntradayDatasets: buildIntradayDatasets,
    buildHeaderPriceHtml: buildHeaderPriceHtml,
    colorToRgba: colorToRgba,
    exchangeMinutes: exchangeMinutes,
    getSessionQuote: getSessionQuote,
    hasPriceData: hasPriceData,
    isRegularMarketTimestamp: isRegularMarketTimestamp,
    splitIntradaySeries: splitIntradaySeries
  };
} else {
  initApp();
}
