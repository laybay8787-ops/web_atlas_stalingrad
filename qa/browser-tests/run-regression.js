const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = process.env.ATLAS_URL || 'https://laybay8787-ops.github.io/web_atlas_stalingrad/';
const OUT = path.resolve(__dirname, 'results', 'regression');
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });

function check(condition, message, checks) {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) throw new Error(message);
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(80);
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const result = { target: TARGET, checks: [], responsive: [], pageErrors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', error => result.pageErrors.push(String(error)));
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.leaflet-tile-loaded', { timeout: 45000 });

    check(await page.locator('script:not([src])').count() === 2,
      'Остались только два основных встроенных сценария', result.checks);
    check(await page.locator('[data-pplx-inline-edit]').count() === 0,
      'Посторонний редакторский сценарий удалён', result.checks);

    const attribution = page.locator('.leaflet-control-attribution');
    check(await attribution.isVisible(), 'Атрибуция карты видима', result.checks);
    const attributionText = await attribution.textContent();
    check(attributionText.includes('OpenStreetMap') && attributionText.includes('HOT'),
      'Атрибуция содержит OSM и HOT', result.checks);
    const attributionRect = await attribution.boundingBox();
    check(attributionRect && attributionRect.y + attributionRect.height <= 772,
      'Атрибуция не перекрыта нижней панелью', result.checks);

    const paneOpacity = () => page.evaluate(() => ({
      vector: document.querySelector('.leaflet-st1942-pane').style.opacity,
      aerial: document.querySelector('.leaflet-eraTiles-pane').style.opacity
    }));
    let opacity = await paneOpacity();
    check(opacity.vector === '0.92' && opacity.aerial === '0.92',
      'В современной эпохе обе панели имеют прозрачность 0.92', result.checks);
    await page.locator('[data-era="1942"]').click();
    opacity = await paneOpacity();
    check(opacity.vector === '0.55' && opacity.aerial === '0.55',
      'В эпохе 1942 года обе панели имеют прозрачность 0.55', result.checks);

    await setRange(page, '#rngOpacity', 0);
    opacity = await paneOpacity();
    check(opacity.vector === '0' && opacity.aerial === '0',
      'При значении 0% полностью скрываются и аэрофото, и векторный слой', result.checks);
    await setRange(page, '#rngOpacity', 23);
    opacity = await paneOpacity();
    check(opacity.vector === '0.23' && opacity.aerial === '0.23',
      'Ползунок одинаково меняет прозрачность аэрофото и векторного слоя', result.checks);
    check(await page.locator('#rngOpacity').getAttribute('aria-valuetext') === '23%',
      'Прозрачность озвучивается в процентах', result.checks);

    await page.locator('#chkVector1942').uncheck();
    await page.locator('input[name="baseMap"][value="carto"]').check();
    check(await page.locator('[data-era="1942"]').getAttribute('aria-pressed') === 'true',
      'Смена подложки не сбрасывает выбранную эпоху', result.checks);
    check(await page.locator('#chkAerial42').isChecked(),
      'Смена подложки не отключает аэрофото', result.checks);
    check(!(await page.locator('#chkVector1942').isChecked()),
      'Смена подложки не включает векторный слой против выбора пользователя', result.checks);
    opacity = await paneOpacity();
    check(opacity.vector === '0.23' && opacity.aerial === '0.23',
      'Смена подложки не сбрасывает прозрачность', result.checks);

    await setRange(page, '#rngSwipe', 64);
    check(await page.locator('#rngSwipe').getAttribute('aria-valuetext') === '64%',
      'Положение шторки озвучивается в процентах', result.checks);

    await page.locator('#locSelect').selectOption('vokzal');
    await page.waitForTimeout(1000);
    const sourcePath = decodeURIComponent(new URL(TARGET).pathname).replace(/^\/([A-Za-z]:)/, '$1');
    const stationSource = TARGET.startsWith('file:')
      ? fs.readFileSync(sourcePath, 'utf8')
      : await (await page.request.get(TARGET)).text();
    check((stationSource.match(/\[48\.712550, 44\.513500\]/g) || []).length === 2 &&
      !stationSource.includes('[48.710000, 44.514000]'),
      'Маркер и навигация вокзала используют уточнённые координаты', result.checks);

    await page.locator('#locSelect').selectOption('mill');
    const millText = await page.locator('#objectCard').innerText();
    check(millText.includes('1899') && millText.includes('1903') && millText.includes('противоаварийные'),
      'Карточка мельницы содержит уточнённую датировку и сведения о консервации', result.checks);
    check(!millText.includes('без реставрации'),
      'Из карточки мельницы удалено неподтверждённое утверждение', result.checks);

    check(result.pageErrors.length === 0, 'Нет необработанных ошибок JavaScript', result.checks);
    await context.close();

    for (const width of [900, 901, 1100, 1101, 1280]) {
      const responsiveContext = await browser.newContext({ viewport: { width, height: 800 } });
      const responsivePage = await responsiveContext.newPage();
      responsivePage.on('pageerror', error => result.pageErrors.push(String(error)));
      await responsivePage.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await responsivePage.waitForSelector('.leaflet-tile-loaded', { timeout: 45000 });
      const mobile = width <= 1100;
      const state = {
        width,
        mobileExpected: mobile,
        sidebarToggleVisible: await responsivePage.locator('#btnToggleSidebar').isVisible(),
        coordsToggleVisible: await responsivePage.locator('#btnToggleCoords').isVisible(),
        sidebarVisible: await responsivePage.locator('#sidebarLeft').isVisible(),
        horizontalOverflow: await responsivePage.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        attributionVisible: await responsivePage.locator('.leaflet-control-attribution').isVisible()
      };
      state.ok = state.sidebarToggleVisible === mobile && state.coordsToggleVisible === mobile &&
        state.sidebarVisible === !mobile && !state.horizontalOverflow && state.attributionVisible;
      result.responsive.push(state);
      check(state.ok, `Адаптивный интерфейс корректен при ширине ${width}px`, result.checks);
      if (width === 901) {
        await responsivePage.screenshot({ path: path.join(OUT, 'width-901.png'), fullPage: false });
      }
      await responsiveContext.close();
    }
    check(result.pageErrors.length === 0, 'Нет ошибок JavaScript на контрольных ширинах', result.checks);
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.fatalError = String(error.stack || error);
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
})();
