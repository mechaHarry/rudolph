const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp() {
  const elements = new Map();
  const document = {
    body: {
      classList: { contains: () => false, add: () => {}, toggle: () => {} },
      className: '',
      appendChild: () => {},
      style: {}
    },
    addEventListener: () => {},
    querySelector: () => null,
    createElement: () => ({ className: '', style: {}, classList: { add: () => {}, remove: () => {} } }),
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          style: {},
          innerHTML: '',
          textContent: '',
          className: '',
          classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
          addEventListener: () => {},
          getContext: () => ({})
        });
      }
      return elements.get(id);
    }
  };
  const context = {
    Chart: function Chart(ctx, config) {
      this.ctx = ctx;
      this.data = config.data;
      this.options = config.options;
      this.update = () => {};
      this.resize = () => {};
      this.destroy = () => {};
    },
    GridStack: { init: () => null },
    clearInterval: () => {},
    console,
    document,
    fetch: async () => ({ ok: false }),
    getComputedStyle: () => ({
      getPropertyValue: (name) => ({
        '--accent': '#5b9bf4',
        '--after-hours': '#f5b642',
        '--green': '#3ddc84',
        '--red': '#f4605a',
        '--text': '#edf0f7',
        '--surface': '#171c28',
        '--surface-hi': '#1e2538',
        '--border': 'rgba(255,255,255,.06)',
        '--grid-line': 'rgba(255,255,255,.03)',
        '--radius-sm': '14px',
        '--font': 'Arial',
        '--font-mono': 'monospace'
      }[name] || '')
    }),
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { reload: () => {} },
    module: { exports: {} },
    requestAnimationFrame: (cb) => cb(),
    setInterval: () => 0,
    setTimeout: (cb) => { if (typeof cb === 'function') cb(); return 0; },
    window: { innerWidth: 1200, innerHeight: 800 }
  };
  context.global = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'js/app.js' });
  return context.module.exports;
}

test('splitIntradaySeries separates premarket and postmarket prices from regular prices', () => {
  const app = loadApp();
  const timestamps = [
    Date.UTC(2026, 4, 13, 8, 0) / 1000,
    Date.UTC(2026, 4, 13, 9, 30) / 1000,
    Date.UTC(2026, 4, 13, 15, 59) / 1000,
    Date.UTC(2026, 4, 13, 16, 1) / 1000
  ];
  const closes = [101.111, 102.222, 103.333, 104.444];

  const series = app.splitIntradaySeries(timestamps, closes, 0);

  assert.deepEqual(Array.from(series.regular), [null, 102.22, 103.33, null]);
  assert.deepEqual(Array.from(series.extended), [101.11, null, null, 104.44]);
  assert.deepEqual(Array.from(series.combined), [101.11, 102.22, 103.33, 104.44]);
  assert.equal(series.hasExtended, true);
});

test('buildIntradayDatasets adds orange/yellow extended-hours line and shade when data exists', () => {
  const app = loadApp();

  const datasets = app.buildIntradayDatasets({
    labels: ['08:00 AM', '09:30 AM', '04:01 PM'],
    regularData: [null, 102, null],
    extendedData: [101, null, 103],
    prevClose: 100,
    priorData: null
  });

  const extended = datasets.find((dataset) => dataset.label === 'Extended Hours');
  assert.ok(extended, 'expected an Extended Hours dataset');
  assert.equal(extended.borderColor, '#f5b642');
  assert.match(extended.backgroundColor, /^rgba\(245,182,66,0\.16\)$/);
  assert.equal(extended.fill, true);
});

test('buildIntradayDatasets omits extended-hours dataset when there are no extended prices', () => {
  const app = loadApp();

  const datasets = app.buildIntradayDatasets({
    labels: ['09:30 AM', '09:31 AM'],
    regularData: [102, 103],
    extendedData: [null, null],
    prevClose: 100,
    priorData: null
  });

  assert.equal(datasets.some((dataset) => dataset.label === 'Extended Hours'), false);
});

test('getSessionQuote reads post-market price during after-hours session', () => {
  const app = loadApp();

  const quote = app.getSessionQuote({
    marketState: 'POST',
    regularMarketPrice: 102.12,
    postMarketPrice: 103.45
  }, [101, 102, 103]);

  assert.equal(quote.price, 103.45);
  assert.equal(quote.session, 'after hours');
  assert.equal(quote.regularPrice, 102.12);
  assert.equal(quote.extendedPrice, 103.45);
  assert.equal(quote.extendedLabel, 'AH');
});

test('buildHeaderPriceHtml displays after-hours price alongside regular price', () => {
  const app = loadApp();

  const html = app.buildHeaderPriceHtml({
    regularPrice: 102.12,
    extendedPrice: 103.45,
    extendedLabel: 'AH'
  });

  assert.equal(
    html,
    '$102.12<span class="extended-price">AH $103.45</span>'
  );
});

test('getSessionQuote falls back to latest extended datapoint when post-market meta is absent', () => {
  const app = loadApp();

  const quote = app.getSessionQuote({
    marketState: 'POST',
    regularMarketPrice: 102.12
  }, [102.12, 102.5, 103.45], [null, null, 103.45]);

  assert.equal(quote.price, 103.45);
  assert.equal(quote.regularPrice, 102.12);
  assert.equal(quote.extendedPrice, 103.45);
  assert.equal(quote.extendedLabel, 'AH');
  assert.equal(app.buildHeaderPriceHtml(quote), '$102.12<span class="extended-price">AH $103.45</span>');
});

test('getSessionQuote does not show stale extended datapoint when regular market has newer matching price', () => {
  const app = loadApp();

  const quote = app.getSessionQuote({
    marketState: 'REGULAR',
    regularMarketPrice: 103.45
  }, [103.45, 103.45], [103.45, null]);

  assert.equal(quote.price, 103.45);
  assert.equal(quote.regularPrice, 103.45);
  assert.equal(quote.extendedPrice, null);
  assert.equal(app.buildHeaderPriceHtml(quote), '$103.45');
});

test('buildStatsHtml renders only min and max graph legend items', () => {
  const app = loadApp();

  const html = app.buildStatsHtml({
    diff: 4,
    pct: 2,
    growPct: 80,
    shrinkPct: 20,
    up: true,
    min: 99.12,
    max: 106.34
  });

  assert.equal(
    html,
    '<span class="stat-pill"><span class="stat-label">Min</span> $99.12</span>' +
      '<span class="stat-pill"><span class="stat-label">Max</span> $106.34</span>'
  );
  assert.equal(html.includes('\u0394'), false);
  assert.equal(html.includes('\u25B2'), false);
  assert.equal(html.includes('\u25BC'), false);
  assert.equal(html.includes('Prior'), false);
});

test('computeStats includes extended-hours prices in min and max when mega data exists', () => {
  const app = loadApp();

  app.__setMegaDataForTest({
    timestamps: [Date.now() / 1000 - 60],
    highs: [105],
    lows: [100],
    closes: [102]
  });

  const stats = app.computeStats([99.5, 102, 107.25], 1);

  assert.equal(stats.min, 99.5);
  assert.equal(stats.max, 107.25);
});

test('closed widget helpers persist hidden widget ids and report reinsertion options', () => {
  const app = loadApp();
  const storage = {};

  app.saveClosedWidgetIds(['stock', 'month'], storage);

  assert.deepEqual(Array.from(app.loadClosedWidgetIds(storage)), ['stock', 'month']);
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.getClosedWidgetOptions(['stock', 'unknown'], [
      { id: 'hourly', title: 'Hour' },
      { id: 'stock', title: 'Today' }
    ]))),
    [{ id: 'stock', title: 'Today' }]
  );
});

test('buildGridOptions enables floating no-gravity layout behavior', () => {
  const app = loadApp();

  const options = app.buildGridOptions({ cellHeight: 72, margin: 4, rows: 9 });

  assert.equal(options.float, true);
  assert.equal(options.cellHeight, 72);
  assert.equal(options.maxRow, 9);
  assert.equal(options.handle, '.card-header');
});

test('calculateCellHeight sizes rows from available grid height', () => {
  const app = loadApp();

  assert.equal(app.calculateCellHeight(720, 9), 80);
  assert.equal(app.calculateCellHeight(180, 9), 30);
});

test('getOpenWidgetLayout excludes closed widgets before grid startup', () => {
  const app = loadApp();
  const layout = [
    { id: 'hourly', x: 0, y: 0, w: 12, h: 3 },
    { id: 'stock', x: 6, y: 3, w: 6, h: 3 },
    { id: 'month', x: 6, y: 3, w: 6, h: 3 },
    { id: 'year', x: 0, y: 3, w: 6, h: 3 },
    { id: 'alltime', x: 0, y: 6, w: 12, h: 3 }
  ];

  const openLayout = app.getOpenWidgetLayout(layout, ['hourly', 'month']);

  assert.deepEqual(
    JSON.parse(JSON.stringify(openLayout)),
    [
      { id: 'stock', x: 6, y: 3, w: 6, h: 3 },
      { id: 'year', x: 0, y: 3, w: 6, h: 3 },
      { id: 'alltime', x: 0, y: 6, w: 12, h: 3 }
    ]
  );
});

test('resolveAppearanceMode follows the system light setting when preference is auto', () => {
  const app = loadApp();

  const resolved = app.resolveAppearanceMode('auto', {
    matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: light)' })
  });

  assert.equal(resolved, 'light');
});

test('resolveAppearanceMode follows the system dark setting when preference is auto', () => {
  const app = loadApp();

  const resolved = app.resolveAppearanceMode('auto', {
    matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: dark)' })
  });

  assert.equal(resolved, 'dark');
});

test('resolveThemeId keeps legacy system preference as automatic appearance', () => {
  const app = loadApp();

  assert.equal(app.resolveThemeId('system'), 'dark');
});

test('themeClassNameFor maps theme family and appearance to body classes', () => {
  const app = loadApp();

  assert.equal(app.themeClassNameFor('oneui', 'light'), 'theme-oneui mode-light');
  assert.equal(app.themeClassNameFor('oneui', 'dark'), 'theme-oneui mode-dark');
  assert.equal(app.themeClassNameFor('glass', 'light'), 'theme-glass mode-light');
  assert.equal(app.themeClassNameFor('webex', 'dark'), 'theme-webex mode-dark');
});

test('default ticker list uses five broad-market symbols without company-specific defaults', () => {
  const app = loadApp();

  assert.deepEqual(JSON.parse(JSON.stringify(app.getDefaultTickers())), [
    { sym: 'NVDA', name: 'NVIDIA Corporation' },
    { sym: 'AAPL', name: 'Apple Inc.' },
    { sym: 'MSFT', name: 'Microsoft Corporation' },
    { sym: 'AMZN', name: 'Amazon.com, Inc.' },
    { sym: 'GOOGL', name: 'Alphabet Inc.' }
  ]);
  assert.equal(app.getInitialTicker({}, app.getDefaultTickers()), 'NVDA');
});

test('loadSavedTickers falls back to the default list when storage is empty or invalid', () => {
  const app = loadApp();
  const emptyStorage = { getItem: () => null };
  const invalidStorage = { getItem: () => 'not json' };

  assert.deepEqual(
    JSON.parse(JSON.stringify(app.loadSavedTickers(emptyStorage))),
    JSON.parse(JSON.stringify(app.getDefaultTickers()))
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.loadSavedTickers(invalidStorage))),
    JSON.parse(JSON.stringify(app.getDefaultTickers()))
  );
});

test('removeTickerFromList can trim the active symbol and selects the next available symbol', () => {
  const app = loadApp();
  const result = app.removeTickerFromList([
    { sym: 'NVDA', name: 'NVIDIA Corporation' },
    { sym: 'AAPL', name: 'Apple Inc.' },
    { sym: 'MSFT', name: 'Microsoft Corporation' }
  ], 'NVDA', 'NVDA');

  assert.deepEqual(JSON.parse(JSON.stringify(result.tickers)), [
    { sym: 'AAPL', name: 'Apple Inc.' },
    { sym: 'MSFT', name: 'Microsoft Corporation' }
  ]);
  assert.equal(result.currentTicker, 'AAPL');
});

test('buildThemeState keeps theme family independent from automatic light mode', () => {
  const app = loadApp();

  const state = app.buildThemeState('material', 'auto', {
    matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: light)' })
  });

  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    themeFamily: 'material',
    appearancePreference: 'auto',
    resolvedAppearance: 'light',
    className: 'theme-material mode-light'
  });
});

test('buildThemeState keeps theme family independent from explicit dark mode', () => {
  const app = loadApp();

  const state = app.buildThemeState('glass', 'dark', {
    matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: light)' })
  });

  assert.deepEqual(JSON.parse(JSON.stringify(state)), {
    themeFamily: 'glass',
    appearancePreference: 'dark',
    resolvedAppearance: 'dark',
    className: 'theme-glass mode-dark'
  });
});

test('getStoredAppearancePreference reads explicit appearance separately from theme family', () => {
  const app = loadApp();
  const storage = {
    getItem: (key) => ({
      'rudolph-theme': 'carbon',
      'rudolph-appearance': 'light'
    }[key] || null)
  };

  assert.equal(app.getStoredThemeFamily(storage), 'carbon');
  assert.equal(app.getStoredAppearancePreference(storage), 'light');
});

test('getStoredAppearancePreference migrates previous light theme selection to explicit light', () => {
  const app = loadApp();
  const storage = {
    getItem: (key) => key === 'rudolph-theme' ? 'light' : null
  };

  assert.equal(app.getStoredThemeFamily(storage), 'oneui');
  assert.equal(app.getStoredAppearancePreference(storage), 'light');
});

test('theme menu selections keep the dropdown open after choosing a theme or appearance', () => {
  const app = loadApp();
  const themeTarget = {
    closest: (selector) => selector === '[data-theme]' ? { dataset: { theme: 'webex' } } : null
  };
  const appearanceTarget = {
    closest: (selector) => selector === '[data-appearance]' ? { dataset: { appearance: 'dark' } } : null
  };
  const emptyTarget = { closest: () => null };

  assert.equal(app.isThemeMenuSelectionTarget(themeTarget), true);
  assert.equal(app.isThemeMenuSelectionTarget(appearanceTarget), true);
  assert.equal(app.isThemeMenuSelectionTarget(emptyTarget), false);
});

test('theme menu labels the webex family as Cisco Momentum', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const newtabHtml = fs.readFileSync(path.join(__dirname, '..', 'newtab.html'), 'utf8');

  assert.match(indexHtml, /data-theme="webex"[^>]*>Cisco Momentum<\/button>/);
  assert.match(newtabHtml, /data-theme="webex"[^>]*>Cisco Momentum<\/button>/);
  assert.doesNotMatch(indexHtml, /Cisco Webex/);
  assert.doesNotMatch(newtabHtml, /Cisco Webex/);
});

test('webex theme CSS uses Momentum stable token values', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

  assert.match(css, /Cisco Momentum/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--bg:\s*#000000;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--surface:\s*#1a1a1a;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--text:\s*#fffffff2;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--accent:\s*#3492eb;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--green:\s*#3cc29a;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--red:\s*#fc8b98;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--font:\s*Momentum, Inter, Arial, 'Helvetica Neue', Helvetica, sans-serif;/);
  assert.match(css, /body\.theme-webex\s*\{[\s\S]*--card-blur:\s*blur\(10px\);/);
  assert.match(css, /body\.theme-webex\.mode-light\s*\{[\s\S]*--bg:\s*#ffffff;/);
  assert.match(css, /body\.theme-webex\.mode-light\s*\{[\s\S]*--surface:\s*#f7f7f7;/);
  assert.match(css, /body\.theme-webex\.mode-light\s*\{[\s\S]*--text:\s*#000000f2;/);
  assert.match(css, /body\.theme-webex\.mode-light\s*\{[\s\S]*--accent:\s*#1170cf;/);
});
