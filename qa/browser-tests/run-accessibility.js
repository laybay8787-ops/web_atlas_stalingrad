const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = process.env.ATLAS_URL || 'https://laybay8787-ops.github.io/web_atlas_stalingrad/';
const OUT = path.resolve(__dirname, 'results', 'accessibility');
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });

async function axeScan(page, name) {
  const result = await page.evaluate(async () => {
    return axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      resultTypes: ['violations', 'incomplete', 'passes']
    });
  });
  const compact = {
    name,
    violations: result.violations.map(v => ({
      id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl,
      nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary }))
    })),
    incomplete: result.incomplete.map(v => ({
      id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl,
      nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary }))
    })),
    passes: result.passes.length
  };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(compact, null, 2));
  return compact;
}

async function activeElement(page) {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return {
      tag: e.tagName, id: e.id, role: e.getAttribute('role'),
      ariaLabel: e.getAttribute('aria-label'), text: (e.innerText || e.value || '').trim().slice(0, 100),
      visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none',
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      inViewport: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
      insideDialog: Boolean(e.closest('dialog, [role="dialog"]'))
    };
  });
}

async function keyboardSequence(page, count) {
  await page.evaluate(() => document.activeElement?.blur());
  const sequence = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    sequence.push(await activeElement(page));
  }
  return sequence;
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const summary = [];
  try {
    for (const profile of [
      { name: 'desktop', options: { viewport: { width: 1280, height: 800 } } },
      { name: 'mobile', options: { ...devices['Pixel 7'] } }
    ]) {
      const context = await browser.newContext(profile.options);
      const page = await context.newPage();
      await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.leaflet-tile-loaded', { timeout: 45000 });
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

      const initial = await axeScan(page, `${profile.name}-initial`);
      summary.push({ state: initial.name, violations: initial.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
      const mapTabStops = await page.evaluate(() => {
        const items = [...document.querySelectorAll('#map [tabindex="0"], #map a[href], #map button, #map input, #map select')].filter(e => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
        });
        const offscreen = items.filter(e => {
          const r = e.getBoundingClientRect();
          return r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth;
        });
        return { total: items.length, offscreen: offscreen.length, sample: offscreen.slice(0, 5).map(e => e.outerHTML) };
      });

      const snapshots = {};
      for (const selector of ['#locSelect', '#rngSwipe', '#rngOpacity', '#btnSources', '#sourceDialog']) {
        snapshots[selector] = await page.locator(selector).ariaSnapshot();
      }
      fs.writeFileSync(path.join(OUT, `${profile.name}-aria.json`), JSON.stringify(snapshots, null, 2));

      if (profile.name === 'desktop') {
        await page.locator('#chkSwipe').check();
        summary.push({ state: 'desktop-swipe', violations: (await axeScan(page, 'desktop-swipe')).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
        await page.locator('#chkSwipe').uncheck();
        await page.locator('#locSelect').selectOption('pavlov');
        summary.push({ state: 'desktop-card', violations: (await axeScan(page, 'desktop-card')).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
        for (const key of ['mill', 'zabolotny']) {
          await page.locator('#locSelect').selectOption(key);
          const name = `desktop-card-${key}`;
          summary.push({ state: name, violations: (await axeScan(page, name)).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
        }
      } else {
        await page.locator('#btnToggleSidebar').click();
        summary.push({ state: 'mobile-sidebar', violations: (await axeScan(page, 'mobile-sidebar')).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
        await page.locator('#btnToggleCoords').click();
        summary.push({ state: 'mobile-coords', violations: (await axeScan(page, 'mobile-coords')).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
        await page.keyboard.press('Escape');
      }

      await page.locator('#btnSources').click();
      const dialogScan = await axeScan(page, `${profile.name}-dialog`);
      summary.push({ state: dialogScan.name, violations: dialogScan.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) });
      await page.locator('#btnCloseSources').focus();
      const trap = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
        trap.push(await activeElement(page));
      }
      const trapPassed = trap.every(e => e && e.insideDialog);
      await page.keyboard.press('Escape');
      const focusAfterEscape = await activeElement(page);

      const sequence = await keyboardSequence(page, 35);
      const keyboard = {
        trapPassed, trap, focusAfterEscape, mapTabStops, sequence,
        invisibleFocused: sequence.filter(e => !e || !e.visible),
        outsideViewport: sequence.filter(e => e && e.visible && !e.inViewport)
      };
      fs.writeFileSync(path.join(OUT, `${profile.name}-keyboard.json`), JSON.stringify(keyboard, null, 2));
      summary.push({ state: `${profile.name}-keyboard`, trapPassed, focusAfterEscape, mapTabStops, invisibleFocused: keyboard.invisibleFocused.length, outsideViewport: keyboard.outsideViewport.length });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
