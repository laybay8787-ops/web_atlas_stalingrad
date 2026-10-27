const { chromium, firefox, webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = process.env.ATLAS_URL || 'https://laybay8787-ops.github.io/web_atlas_stalingrad/';
const OUT = path.resolve(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function check(condition, message, checks) {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) throw new Error(message);
}

async function coreScenario(name, browserType, launchOptions, contextOptions) {
  const result = { name, checks: [], pageErrors: [], requestFailures: [] };
  let browser;
  try {
    browser = await browserType.launch(launchOptions);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.on('pageerror', error => result.pageErrors.push(String(error)));
    page.on('requestfailed', request => {
      const url = request.url();
      if (!url.startsWith('data:')) result.requestFailures.push({ url, error: request.failure()?.errorText });
    });
    const response = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
    result.httpStatus = response?.status();
    result.userAgent = await page.evaluate(() => navigator.userAgent);
    await page.waitForSelector('.leaflet-tile-loaded', { timeout: 45000 });
    check(await page.locator('#map').isVisible(), 'Карта видима', result.checks);
    check(await page.evaluate(() => Boolean(window.L && L.map)), 'Leaflet загружен', result.checks);

    for (const era of ['1942', '1943', 'modern']) {
      await page.locator(`[data-era="${era}"]`).click();
      check(await page.locator(`[data-era="${era}"]`).getAttribute('aria-pressed') === 'true', `Эпоха ${era} активна`, result.checks);
      if (era === '1942') check(await page.locator('#chkAerial42').isChecked(), 'Аэрофото 1942 включено', result.checks);
      if (era === '1943') check(await page.locator('#chkAerial43').isChecked(), 'Аэрофото 1943 включено', result.checks);
    }

    const isMobile = page.viewportSize().width <= 1100;
    const setPanel = async (panel, open) => {
      if (!isMobile) return;
      const isSidebar = panel === 'sidebar';
      const locator = page.locator(isSidebar ? '#sidebarLeft' : '#coordControls');
      if ((await locator.isVisible()) !== open) {
        await page.locator(isSidebar ? '#btnToggleSidebar' : '#btnToggleCoords').click();
      }
    };

    await setPanel('sidebar', true);
    for (const base of ['carto', 'sat', 'detailed']) {
      await page.locator(`input[name="baseMap"][value="${base}"]`).check();
      check(await page.locator(`input[name="baseMap"][value="${base}"]`).isChecked(), `Подложка ${base} выбрана`, result.checks);
    }
    await setPanel('sidebar', false);

    const expectedCards = { pavlov: true, zabolotny: true, mill: true, square: false, ogareva: true, kommunal: true, elevator: true, vokzal: true, mamayev: false, stz: false };
    for (const [key, visible] of Object.entries(expectedCards)) {
      await page.locator('#locSelect').selectOption(key);
      check((await page.locator('#objectCard').isVisible()) === visible, `Навигация ${key}: состояние карточки корректно`, result.checks);
    }

    await setPanel('coords', true);
    await page.locator('#coordInput').fill('91, 44');
    await page.locator('#btnGoCoord').click();
    check(await page.locator('#coordInput').getAttribute('aria-invalid') === 'true', 'Некорректные координаты отклонены', result.checks);
    await page.locator('#coordInput').fill('48.716086, 44.531389');
    await page.locator('#btnGoCoord').click();
    check((await page.locator('#coordHelp').textContent()).includes('48.716086'), 'Корректные координаты приняты', result.checks);
    await setPanel('coords', false);

    await setPanel('sidebar', true);
    await page.locator('#chkObjects').check();
    check(await page.locator('.leaflet-objects-pane svg path').count() === 9, 'Показаны 9 объектов', result.checks);
    await setPanel('sidebar', true);
    await page.locator('#chkObjects').uncheck();
    check(await page.locator('.leaflet-objects-pane svg path').count() === 1, 'Основной маркер восстановлен', result.checks);

    await page.locator('#chkSwipe').check();
    await page.locator('#rngSwipe').evaluate(element => { element.value = '70'; });
    await page.locator('#rngSwipe').dispatchEvent('input');
    await page.waitForTimeout(100);
    check(await page.locator('#rngSwipe').inputValue() === '70', 'Шторка перемещается', result.checks);
    await page.locator('#btnSwapSides').click();
    check((await page.locator('.swipe-tag-left').textContent()) === 'Волгоград', 'Стороны шторки меняются', result.checks);
    await page.locator('#chkSwipe').uncheck();
    await setPanel('sidebar', false);

    await page.locator('#btnSources').click();
    check(await page.locator('#sourceDialog').isVisible(), 'Диалог источников открывается', result.checks);
    await page.keyboard.press('Escape');
    check(!(await page.locator('#sourceDialog').isVisible()), 'Диалог источников закрывается по Escape', result.checks);

    const viewport = page.viewportSize();
    if (viewport.width <= 1100) {
      await page.locator('#btnToggleSidebar').click();
      check(await page.locator('#sidebarLeft').isVisible(), 'Мобильная панель слоёв открывается', result.checks);
      await page.locator('#btnToggleCoords').click();
      check(!(await page.locator('#sidebarLeft').isVisible()), 'Панель координат закрывает панель слоёв', result.checks);
      check(await page.locator('#coordControls').isVisible(), 'Мобильная панель координат открывается', result.checks);
      await page.keyboard.press('Escape');
    }
    result.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!result.horizontalOverflow, 'Нет горизонтального переполнения документа', result.checks);
    check(result.pageErrors.length === 0, 'Нет необработанных ошибок JavaScript', result.checks);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    result.ok = result.checks.every(x => x.ok);
  } catch (error) {
    result.ok = false;
    result.fatalError = String(error.stack || error);
  } finally {
    if (browser) await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function cdnScenario(name, blockedHosts) {
  const result = { name, blockedHosts, requestedCdn: [], checks: [], pageErrors: [] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const page = await context.newPage();
    page.on('pageerror', error => result.pageErrors.push(String(error)));
    await page.route('**/*', async route => {
      const url = route.request().url();
      const host = new URL(url).hostname;
      if (['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'].includes(host)) {
        result.requestedCdn.push(url);
        if (blockedHosts.includes(host)) return route.abort('failed');
      }
      return route.continue();
    });
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (blockedHosts.length < 3) {
      await page.waitForSelector('.leaflet-tile-loaded', { timeout: 45000 });
      check(await page.evaluate(() => Boolean(window.L && L.map)), 'Leaflet загружен через резервный CDN', result.checks);
      check(!(await page.locator('#mapLoadError').isVisible()), 'Аварийное сообщение не показано', result.checks);
    } else {
      await page.locator('#mapLoadError').waitFor({ state: 'visible', timeout: 45000 });
      check(await page.locator('#mapLoadError').isVisible(), 'Показано аварийное сообщение', result.checks);
      check(!(await page.evaluate(() => Boolean(window.L && L.map))), 'Leaflet действительно недоступен', result.checks);
      if (!(await page.locator('#coordControls').isVisible())) {
        await page.locator('#btnToggleCoords').click();
      }
      await page.locator('#coordInput').fill('91, 44');
      await page.locator('#btnGoCoord').click();
      check(await page.locator('#coordInput').getAttribute('aria-invalid') === 'true', 'Валидация координат работает без Leaflet', result.checks);
      await page.locator('#coordInput').fill('48.716086, 44.531389');
      await page.locator('#btnGoCoord').click();
      check((await page.locator('#mapLoadError').textContent()).includes('Координаты верны'), 'Успешная валидация работает без Leaflet', result.checks);
      await page.locator('#btnSources').click();
      check(await page.locator('#sourceDialog').isVisible(), 'Источники открываются без Leaflet', result.checks);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(OUT, 'cdn-all-failed.png') });
    }
    check(result.pageErrors.length === 0, 'Нет необработанных исключений', result.checks);
    result.ok = result.checks.every(x => x.ok);
  } catch (error) {
    result.ok = false;
    result.fatalError = String(error.stack || error);
  } finally {
    if (browser) await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(result, null, 2));
  return result;
}

(async () => {
  const jobs = [
    ['firefox-desktop', firefox, { headless: true }, { viewport: { width: 1280, height: 800 } }],
    ['webkit-desktop', webkit, { headless: true }, { viewport: { width: 1280, height: 800 } }],
    ['webkit-iphone-emulation', webkit, { headless: true }, { ...devices['iPhone 14'] }],
    ['chromium-android-emulation', chromium, { executablePath: chromePath, headless: true }, { ...devices['Pixel 7'] }]
  ];
  const results = [];
  for (const job of jobs) {
    console.log(`RUN ${job[0]}`);
    const result = await coreScenario(...job);
    console.log(JSON.stringify({ name: result.name, ok: result.ok, checks: result.checks.length, errors: result.pageErrors, fatal: result.fatalError }));
    results.push(result);
  }
  for (const [name, hosts] of [
    ['cdn-first-failed', ['cdn.jsdelivr.net']],
    ['cdn-first-two-failed', ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com']],
    ['cdn-all-failed', ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com']]
  ]) {
    console.log(`RUN ${name}`);
    const result = await cdnScenario(name, hosts);
    console.log(JSON.stringify({ name, ok: result.ok, checks: result.checks.length, fatal: result.fatalError, cdn: [...new Set(result.requestedCdn.map(u => new URL(u).hostname))] }));
    results.push(result);
  }
  const summary = results.map(r => ({ name: r.name, ok: r.ok, checks: r.checks.length, failedChecks: r.checks.filter(c => !c.ok), pageErrors: r.pageErrors, fatalError: r.fatalError }));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('SUMMARY', JSON.stringify(summary));
  if (summary.some(x => !x.ok)) process.exitCode = 1;
})();
