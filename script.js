/* =========================================================================
   Веб-атлас Сталинградской битвы — логика карты.

   Структура файла:
     1. bindSourceDialog — открытие/закрытие диалога «Источники».
     2. setupFallbackUi — резервный режим, если Leaflet не загрузился.
     3. window.__leafletReady.then(...) — основная логика атласа.
        В самом верху этого блока — МЕСТО ДЛЯ МАССИВА CITY_DATA.
   ========================================================================= */

/* ---------- 1. Диалог «Источники» ---------- */
(function bindSourceDialog() {
  const dialog = document.getElementById('sourceDialog');
  const openButton = document.getElementById('btnSources');
  const closeButton = document.getElementById('btnCloseSources');
  if (!dialog || !openButton || !closeButton) return;
  const panel = dialog.querySelector('.source-dialog-panel');
  let previousFocus = null;
  function openDialog() {
    previousFocus = document.activeElement;
    dialog.hidden = false;
    closeButton.focus();
  }
  function closeDialog() {
    dialog.hidden = true;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    else openButton.focus();
  }
  openButton.addEventListener('click', openDialog);
  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) closeDialog();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !dialog.hidden) closeDialog();
  });
  if (panel) panel.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    const focusable = panel.querySelectorAll('a[href], button:not([disabled])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();

/* ---------- 2. Резервный режим без Leaflet ---------- */
function setupFallbackUi(error) {
  if (window.__atlasFallbackBound) return;
  window.__atlasFallbackBound = true;
  console.error('Веб-атлас: интерактивная карта не запущена.', error || 'Leaflet unavailable');
  const warning = document.getElementById('mapLoadError');
  const sidebar = document.getElementById('sidebarLeft');
  const coords = document.getElementById('coordControls');
  const sidebarButton = document.getElementById('btnToggleSidebar');
  const coordsButton = document.getElementById('btnToggleCoords');
  const coordInput = document.getElementById('coordInput');

  function message(text) {
    if (!warning) return;
    warning.textContent = text;
    warning.hidden = false;
  }
  message('Картографическая библиотека не загрузилась. Проверьте подключение к интернету или попробуйте другую сеть. Меню и проверка координат доступны, но перемещение по карте требует загрузки библиотеки и картографических слоёв.');

  if (sidebarButton && sidebar) sidebarButton.addEventListener('click', function () {
    const open = sidebar.classList.toggle('mobile-open');
    sidebarButton.setAttribute('aria-expanded', String(open));
    if (open && coords && coordsButton) {
      coords.classList.remove('is-open');
      coordsButton.setAttribute('aria-expanded', 'false');
    }
  });
  if (coordsButton && coords) coordsButton.addEventListener('click', function () {
    const open = coords.classList.toggle('is-open');
    coordsButton.setAttribute('aria-expanded', String(open));
    if (open && sidebar && sidebarButton) {
      sidebar.classList.remove('mobile-open');
      sidebarButton.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (coords) coords.classList.remove('is-open');
    if (sidebarButton) sidebarButton.setAttribute('aria-expanded', 'false');
    if (coordsButton) coordsButton.setAttribute('aria-expanded', 'false');
  });
  const closeCard = document.getElementById('btnCloseCard');
  if (closeCard) closeCard.addEventListener('click', function () {
    const card = document.getElementById('objectCard');
    if (card) card.classList.add('hidden');
  });
  if (coordInput) coordInput.addEventListener('input', function () { coordInput.removeAttribute('aria-invalid'); });
  const coordButton = document.getElementById('btnGoCoord');
  if (coordButton) coordButton.addEventListener('click', function () {
    const parts = (coordInput ? coordInput.value : '').trim().split(/[;,\s]+/).filter(Boolean);
    const lat = parts.length === 2 ? Number(parts[0]) : NaN;
    const lng = parts.length === 2 ? Number(parts[1]) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      if (coordInput) coordInput.setAttribute('aria-invalid', 'true');
      message('Введите две корректные координаты: широту от −90 до 90 и долготу от −180 до 180. Пример: 48.716086, 44.531389.');
      return;
    }
    message('Координаты верны, но карта пока недоступна. Перезагрузите страницу или попробуйте другую сеть.');
  });
  if (coordInput) coordInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && coordButton) coordButton.click();
  });
  ['btnFlyPavlov', 'btnOverview'].forEach(function (id) {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', function () {
      message('Эта команда требует интерактивной карты. Проверьте интернет-соединение и обновите страницу.');
    });
  });
  const locSelect = document.getElementById('locSelect');
  if (locSelect) locSelect.addEventListener('change', function () {
    message('Выбран объект: ' + locSelect.options[locSelect.selectedIndex].text + '. Для перехода карта должна загрузиться.');
  });
  document.querySelectorAll('.era-btn').forEach(function (control) {
    control.addEventListener('click', function () {
      message('Переключение эпохи требует загруженной карты. Попробуйте обновить страницу или подключиться к другой сети.');
    });
  });
  document.querySelectorAll('input[name="baseMap"], #sidebarLeft input, #sidebarLeft select, #sidebarLeft [type="range"]').forEach(function (control) {
    control.addEventListener('change', function () {
      message('Эта настройка изменит карту после загрузки картографической библиотеки. Попробуйте обновить страницу или подключиться к другой сети.');
    });
  });
}

/* ---------- 3. Основная логика атласа ---------- */
window.__leafletReady.then(function () {

  // Данные приходят из city-data.js (window.CITY_DATA).
  // city-data.js должен быть подключён в index.html ДО script.js.
  const CITY_DATA = window.CITY_DATA;

  if (
    !CITY_DATA ||
    !Array.isArray(CITY_DATA.streets) ||
    !Array.isArray(CITY_DATA.rails) ||
    !Array.isArray(CITY_DATA.water) ||
    !Array.isArray(CITY_DATA.islands) ||
    !CITY_DATA.photos
  ) {
    throw new Error(
      'CITY_DATA не загружен. Проверьте, что city-data.js подключён перед script.js и содержит объект window.CITY_DATA.'
    );
  }

  // ============ 1. Инициализация карты ============
  const map = L.map('map', {
    center: [48.716086, 44.531389],
    zoom: 17,
    preferCanvas: true,
    minZoom: 12,
    maxZoom: 19,
    zoomControl: false,
    attributionControl: false
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  // Современные объекты вынесены из исторической панели: шторка/прозрачность не должны их обрезать.
  const objectsPane = map.createPane('objectsPane');
  objectsPane.style.zIndex = 625;
  const objectsMarkerRenderer = L.svg({ pane: 'objectsPane' });



  // Подписи уменьшаются при приближении, чтобы не перекрывать карту на телефонах.
  function updateMapLabelScale() {
    const zoom = map.getZoom();
    const scale = Math.max(0.72, Math.min(1, 1 - Math.max(0, zoom - 12) * 0.04));
    document.documentElement.style.setProperty('--map-label-scale', scale.toFixed(2));
    document.documentElement.style.setProperty('--map-label-shadow', (4 * scale).toFixed(2) + 'px');
  }
  map.on('zoomend', updateMapLabelScale);
  updateMapLabelScale();

  // Панели исторических слоёв
  const eraTilesPane = map.createPane('eraTilesPane');
  eraTilesPane.style.zIndex = 440;
  const histPane = map.createPane('st1942Pane');
  histPane.style.zIndex = 450;
  const aerialAnnotPane = map.createPane('aerialAnnotPane');
  aerialAnnotPane.style.zIndex = 455;

  // ============ 2. Подложки ============
  const detailedBase = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: 'Tiles style by HOT'
  }).addTo(map);

  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '© CARTO'
  });

  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: '© Esri'
  });

  const aerial42 = L.tileLayer('https://volmap.ru/files/st42/{z}/{y}/{x}.jpg', {
    minZoom: 12, maxZoom: 19, maxNativeZoom: 17, pane: 'eraTilesPane',
    attribution: 'Аэрофотосъёмка 1942 г. — volmap.ru'
  });
  const aerial43 = L.tileLayer('https://volmap.ru/files/st43/{z}/{y}/{x}.jpg', {
    minZoom: 12, maxZoom: 19, maxNativeZoom: 17, pane: 'eraTilesPane',
    attribution: 'Аэрофотосъёмка 29.03.1943 — volmap.ru'
  });

  const modernBases = { detailed: detailedBase, carto: cartoLight, sat: esriSat };
  let currentEra = 'modern';

  function setEra(era) {
    currentEra = era;
    [detailedBase, cartoLight, esriSat].forEach(l => map.removeLayer(l));
    map.removeLayer(aerial42);
    map.removeLayer(aerial43);
    let sel = document.querySelector('input[name="baseMap"]:checked');
    if (!sel) { document.querySelector('input[name="baseMap"][value="detailed"]').checked = true; sel = document.querySelector('input[name="baseMap"]:checked'); }
    modernBases[sel.value].addTo(map);
    if (era === '1942') {
      aerial42.addTo(map);
      if (!map.hasLayer(stalingrad1942VectorGroup)) { stalingrad1942VectorGroup.addTo(map); document.getElementById('chkVector1942').checked = true; }
      document.getElementById('chkAerial42').checked = true;
      document.getElementById('chkAerial43').checked = false;
      showEraHint('Сталинград, весна 1942 года', 'город до разрушения — аэрофотосъёмка volmap.ru');
    } else if (era === '1943') {
      aerial43.addTo(map);
      if (!map.hasLayer(stalingrad1942VectorGroup)) { stalingrad1942VectorGroup.addTo(map); document.getElementById('chkVector1942').checked = true; }
      document.getElementById('chkAerial43').checked = true;
      document.getElementById('chkAerial42').checked = false;
      showEraHint('Сталинград, 29 марта 1943 года', 'разрушенный город после 200 дней битвы — volmap.ru');
    } else {
      document.getElementById('chkAerial42').checked = false;
      document.getElementById('chkAerial43').checked = false;
      hideEraHint();
    }
    document.querySelectorAll('.era-btn').forEach(b => {
      const active = b.dataset.era === era;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    const swipeTitle = document.getElementById('swipeSectionTitle');
    if (swipeTitle) swipeTitle.textContent = 'Шторка: Волгоград ⇄ Сталинград ' + (era === 'modern' ? '1942' : era);
    const rng = document.getElementById('rngOpacity');
    const lbl = document.getElementById('lblOpacity');
    if (era === 'modern') {
      histPane.style.opacity = 0.92; eraTilesPane.style.opacity = 1; rng.value = 92; lbl.textContent = '92%';
    } else {
      histPane.style.opacity = 0.55; eraTilesPane.style.opacity = 1; rng.value = 55; lbl.textContent = '55%';
    }
    updateSwipeClip();
  }

  document.querySelectorAll('.era-btn').forEach(b => {
    b.addEventListener('click', () => setEra(b.dataset.era));
  });

  const eraHint = document.getElementById('eraHint');
  let eraHintTimer = null;
  function showEraHint(t, s) {
    document.getElementById('eraHintTitle').textContent = t;
    document.getElementById('eraHintSub').textContent = s;
    eraHint.style.display = 'block';
    clearTimeout(eraHintTimer);
    eraHintTimer = setTimeout(hideEraHint, 6000);
  }
  function hideEraHint() { eraHint.style.display = 'none'; }

  // ============ 3. ТЁМНАЯ ВЕКТОРНАЯ КАРТА СТАЛИНГРАДА 1942 ============
  const SHEET = [[48.60, 44.35], [48.84, 44.75]];
  const stalingrad1942VectorGroup = L.layerGroup();

  L.polygon([
    [SHEET[0][0], SHEET[0][1]], [SHEET[0][0], SHEET[1][1]],
    [SHEET[1][0], SHEET[1][1]], [SHEET[1][0], SHEET[0][1]]
  ], { pane: 'st1942Pane', stroke: false, fillColor: '#16191e', fillOpacity: 1, interactive: false })
    .addTo(stalingrad1942VectorGroup);

  CITY_DATA.water.forEach(pts => {
    L.polygon(pts, {
      pane: 'st1942Pane', color: '#27496b', weight: 1,
      fillColor: '#1b334b', fillOpacity: 1, interactive: false
    }).addTo(stalingrad1942VectorGroup);
  });
  CITY_DATA.islands.forEach(pts => {
    L.polygon(pts, {
      pane: 'st1942Pane', color: '#2c3440', weight: 0.6,
      fillColor: '#1e222a', fillOpacity: 1, interactive: false
    }).addTo(stalingrad1942VectorGroup);
  });

  const OLD_NAMES = {
    'проспект Ленина': 'Октябрьская (центр. часть)',
    'Советская улица': 'Пензенская',
    'улица Маршала Чуйкова': 'Краснопитерская',
    'улица 13-й Гвардейской Дивизии': 'Солнечная',
    'улица Наумова': 'Тамбовская',
    'улица Милиционера Буханцева': 'Вокзальная',
  };

  const STREET_STYLES = {
    major: { color: '#ebcb8b', weight: 2.4, opacity: 0.95 },
    mid:   { color: '#c7956f', weight: 1.6, opacity: 0.9 },
    minor: { color: '#4c566a', weight: 1.2, opacity: 0.85 }
  };
  const streetLayers = { major: [], mid: [], minor: [] };
  const namedStreetSegments = { major: new Map(), mid: new Map(), minor: new Map() };
  const unnamedStreetSegments = { major: [], mid: [], minor: [] };
  CITY_DATA.streets.forEach(s => {
    const cls = s[0], name = s[1], pts = s[2];
    if (!STREET_STYLES[cls] || !Array.isArray(pts) || pts.length < 2) return;
    if (name) {
      if (!namedStreetSegments[cls].has(name)) namedStreetSegments[cls].set(name, []);
      namedStreetSegments[cls].get(name).push(pts);
    } else {
      unnamedStreetSegments[cls].push(pts);
    }
  });
  Object.keys(STREET_STYLES).forEach(cls => {
    const opts = STREET_STYLES[cls];
    namedStreetSegments[cls].forEach((segments, name) => {
      const old = OLD_NAMES[name];
      const line = L.polyline(segments, { pane: 'st1942Pane', ...opts, smoothFactor: 1.5 });
      line.bindTooltip(
        old ? `${name}<br><span class="old-name">в 1942 г.: ${old}</span>` : name,
        { className: 'leaflet-tooltip-vec', sticky: true }
      );
      line.addTo(stalingrad1942VectorGroup);
      streetLayers[cls].push(line);
    });
    if (unnamedStreetSegments[cls].length) {
      const line = L.polyline(unnamedStreetSegments[cls], {
        pane: 'st1942Pane', ...opts, interactive: false, smoothFactor: 1.5
      }).addTo(stalingrad1942VectorGroup);
      streetLayers[cls].push(line);
    }
  });

  const railSegments = { rail: [], tram: [] };
  CITY_DATA.rails.forEach(r => railSegments[r[0] === 1 ? 'tram' : 'rail'].push(r[1]));
  if (railSegments.rail.length) {
    L.polyline(railSegments.rail, {
      pane: 'st1942Pane', color: '#111317', weight: 3.2, opacity: 0.9, smoothFactor: 1.5
    }).bindTooltip('Железная дорога (довоенная)', { className: 'leaflet-tooltip-vec', sticky: true })
      .addTo(stalingrad1942VectorGroup);
  }
  if (railSegments.tram.length) {
    L.polyline(railSegments.tram, {
      pane: 'st1942Pane', color: '#b48ead', weight: 1.6, dashArray: '3,3', opacity: 0.9, smoothFactor: 1.5
    }).bindTooltip('Трамвайная линия', { className: 'leaflet-tooltip-vec', sticky: true })
      .addTo(stalingrad1942VectorGroup);
  }

  // ============ Линия фронта (19 ноября 1942 г.) ============
  const FRONT_LINE = [
    [48.8050, 44.5890], [48.7940, 44.5830], [48.7880, 44.5780], [48.7810, 44.5750],
    [48.7770, 44.5700], [48.7710, 44.5620], [48.7660, 44.5570], [48.7620, 44.5530],
    [48.7560, 44.5460], [48.7520, 44.5430], [48.7480, 44.5400], [48.7424, 44.5369],
    [48.7380, 44.5330], [48.7330, 44.5300], [48.7280, 44.5270], [48.7230, 44.5250],
    [48.7190, 44.5245], [48.7161, 44.5275], [48.7130, 44.5265], [48.7103, 44.5256],
    [48.7030, 44.5235], [48.6950, 44.5200], [48.6870, 44.5160], [48.6830, 44.5140]
  ];
  const frontLineGroup = L.layerGroup();
  L.polyline(FRONT_LINE, {
    pane: 'st1942Pane', color: '#ff3333', weight: 2.6, dashArray: '8,5', opacity: 0.95
  }).bindPopup(
    '<strong>Передний край обороны 62-й и 64-й армий (19 ноября 1942 г.)</strong><br>' +
    'День начала контрнаступления советских войск под Сталинградом.<br>' +
    '<b>Линия схематичная</b> — трасса восстановлена приблизительно, по описанию участков обороны дивизий ' +
    'и мемориального комплекса башен Т-34 «Передний край обороны Сталинграда» (17 башен в точках максимального ' +
    'приближения противника к Волге). Для точной трассировки используйте оперативные карты.<br>' +
    '<a href="https://voopiik34.ru/object/perednij-kraj-oborony-g-stalingrada-v-1942-1943-gg-oboznachennyj-25-memorialnymi-znakami/" target="_blank" rel="noopener noreferrer">Об объекте (ВООПИиК)</a><br>' +
    `<img src="${CITY_DATA.photos.karta}" style="width:260px;border-radius:4px;margin-top:6px;" alt="Оперативная карта">` +
    '<div style="font-size:10.5px;color:#666;margin-top:2px;">Оперативная карта Сталинградского фронта (декабрь 1942 г.)</div>'
  ).addTo(frontLineGroup);

  [[48.8050,44.5890],[48.7940,44.5830],[48.7810,44.5750],[48.7660,44.5570],[48.7520,44.5430],
   [48.7424,44.5369],[48.7330,44.5300],[48.7190,44.5245],[48.7103,44.5256],[48.6950,44.5200],
   [48.6830,44.5140]].forEach(p => {
    L.marker(p, {
      pane: 'st1942Pane',
      icon: L.divIcon({ className: '', html: '<div class="t34-marker"></div>', iconSize: [16,16] })
    }).bindTooltip('Точка переднего края обороны (19.11.1942, схема)', { className: 'leaflet-tooltip-vec' })
      .addTo(frontLineGroup);
  });

  // ============ Подписи ============
  const vecLabelsGroup = L.layerGroup().addTo(map);
  const LANDMARKS = [
    { txt: 'МАМАЕВ КУРГАН (выс. 102,0)', pos: [48.7424, 44.5369], cls: 'vec-label vec-label-red' },
    { txt: '«Родина-мать зовёт!»', pos: [48.7440, 44.5388], cls: 'vec-label-sm vec-label-red' },
    { txt: 'ДОМ ПАВЛОВА • МЕЛЬНИЦА ГЕРГАРДТА', pos: [48.7155, 44.5320], cls: 'vec-label vec-label-gold' },
    { txt: 'З-Д «КРАСНЫЙ ОКТЯБРЬ»', pos: [48.7515, 44.5603], cls: 'vec-label vec-label-gold' },
    { txt: 'З-Д «БАРРИКАДЫ»', pos: [48.7768, 44.5754], cls: 'vec-label vec-label-gold' },
    { txt: 'СТЗ (ТРАКТОРНЫЙ ЗАВОД)', pos: [48.7938, 44.6029], cls: 'vec-label vec-label-gold' },
    { txt: 'ОСТРОВ ЛЮДНИКОВА', pos: [48.7810, 44.5748], cls: 'vec-label-sm vec-label-red' },
    { txt: 'ЭЛЕВАТОР', pos: [48.6811, 44.4892], cls: 'vec-label vec-label-red' },
    { txt: 'ВОКЗАЛ СТАЛИНГРАД-I', pos: [48.7090, 44.5135], cls: 'vec-label' },
    { txt: 'ПЛ. ПАВШИХ БОРЦОВ', pos: [48.7072, 44.5161], cls: 'vec-label-sm' },
    { txt: 'ЛЫСАЯ ГОРА (выс. 145,5)', pos: [48.6424, 44.3924], cls: 'vec-label vec-label-red' },
    { txt: 'ДОМ ГРУЗЧИКОВ', pos: [48.6952, 44.4958], cls: 'vec-label-sm vec-label-gold' },
    { txt: 'РЕКА ВОЛГА', pos: [48.735, 44.575], cls: 'vec-label', italic: true },
    { txt: 'о. САРПИНСКИЙ', pos: [48.685, 44.625], cls: 'vec-label-sm' },
    { txt: 'Орловка', pos: [48.828, 44.645], cls: 'vec-label-sm' },
    { txt: 'Горная Поляна', pos: [48.648, 44.455], cls: 'vec-label-sm' },
    { txt: 'Краснослободск', pos: [48.662, 44.617], cls: 'vec-label-sm' }
  ];
  LANDMARKS.forEach(m => {
    L.marker(m.pos, {
      pane: 'st1942Pane',
      icon: L.divIcon({ className: '', html: `<span class="${m.cls}" style="${m.italic ? 'font-style:italic;letter-spacing:3px;' : ''}">${m.txt}</span>`, iconSize: null })
    }).addTo(vecLabelsGroup);
  });

  // Подписи главных улиц (по одной на название)
  (function () {
    const seen = {};
    const labelPts = {};
    CITY_DATA.streets.forEach(s => {
      const cls = s[0], name = s[1], pts = s[2];
      if (!name || cls === 'minor') return;
      if (!seen[name]) { seen[name] = 0; }
      seen[name]++;
      const len = pts.reduce((a, p, i) => i ? a + Math.hypot(p[0]-pts[i-1][0], (p[1]-pts[i-1][1])*0.64) : 0, 0);
      if (!labelPts[name] || labelPts[name].len < len) {
        const mid = pts[Math.floor(pts.length / 2)];
        labelPts[name] = { len, pos: mid };
      }
    });
    if (labelPts['проспект Ленина']) labelPts['проспект Ленина'].pos = [48.71257, 44.52611];
    Object.keys(labelPts).forEach(name => {
      if (seen[name] < 1) return;
      const old = OLD_NAMES[name];
      const disp = old ? old : name.replace('улица ', '').replace(' улица', '');
      L.marker(labelPts[name].pos, {
        pane: 'st1942Pane',
        icon: L.divIcon({ className: '', html: `<span class="vec-label-sm" style="color:#a9b5c9;">${disp}</span>`, iconSize: null })
      }).bindTooltip(name + (old ? `<br><span class="old-name">в 1942 г.: ${old}</span>` : ''), { className: 'leaflet-tooltip-vec' })
        .addTo(vecLabelsGroup);
    });
  })();

  // ============ Квартал пл. 9-го Января (детально) ============
  const quarterGroup = L.layerGroup();
  L.polygon([
    [48.71618, 44.52905], [48.71545, 44.53065], [48.71662, 44.53168], [48.71735, 44.53008]
  ], {
    pane: 'st1942Pane', color: '#b45309', weight: 1.5, dashArray: '4,4',
    fillColor: '#4a4132', fillOpacity: 0.5
  }).bindPopup('<strong>Площадь 9-го Января (1942 г.)</strong><br>Современное название — площадь Ленина.')
    .addTo(quarterGroup);

  const historicBuildings1942 = [
    { key: 'pavlov', name: 'Дом Павлова (ул. Пензенская, 61)', strong: true,
      coords: [[48.71588,44.53108],[48.71632,44.53148],[48.71622,44.53168],[48.71578,44.53128]] },
    { key: 'zabolotny', name: 'Дом Заболотного (Дом Совконтроля)', strong: true,
      coords: [[48.71532,44.53058],[48.71572,44.53094],[48.71562,44.53114],[48.71522,44.53078]] },
    { key: 'mill', name: 'Госмельница № 4 (мельница Гергардта)', strong: true,
      coords: [[48.71508,44.53272],[48.71552,44.53312],[48.71536,44.53342],[48.71492,44.53302]] },
    { key: 'milkhouse', name: '«Молочный дом» (Дом кооперации)', strong: true,
      coords: [[48.71682,44.53162],[48.71722,44.53198],[48.71710,44.53220],[48.71670,44.53184]] },
    { key: 'nkvd', name: 'Здание УНКВД', strong: false,
      coords: [[48.71635,44.52875],[48.71688,44.52922],[48.71672,44.52952],[48.71619,44.52905]] },
    { key: 'gosbank', name: 'Квартал Госбанка', strong: false,
      coords: [[48.71468,44.52995],[48.71508,44.53032],[48.71492,44.53062],[48.71452,44.53025]] }
  ];
  historicBuildings1942.forEach(b => {
    const poly = L.polygon(b.coords, {
      pane: 'st1942Pane',
      color: b.strong ? '#fbbf24' : '#78716c',
      weight: b.strong ? 2.5 : 1.5,
      fillColor: b.strong ? '#991b1b' : '#3b3f4a',
      fillOpacity: 0.9
    }).bindPopup(`<strong>${b.name}</strong><br>Довоенное здание квартала пл. 9-го Января.`)
      .addTo(quarterGroup);
    if (b.key === 'pavlov') poly.on('click', () => showObjectCard('pavlov'));
    if (b.key === 'zabolotny') poly.on('click', () => showObjectCard('zabolotny'));
    if (b.key === 'mill') poly.on('click', () => showObjectCard('mill'));
  });

  L.polyline([[48.7174,44.5270],[48.7163,44.5296],[48.71572,44.53115],[48.71535,44.53255],[48.71522,44.53305]], {
    pane: 'st1942Pane', color: '#111317', weight: 3, dashArray: '6,6'
  }).bindPopup('<strong>Железнодорожная ветка к Госмельнице № 4 (1942 г.)</strong><br>Проходила между Домом Павлова и Домом Заболотного.')
    .addTo(quarterGroup);

  L.polygon([[48.71655,44.53015],[48.71555,44.52985],[48.71535,44.53075],[48.71630,44.53155]], {
    pane: 'st1942Pane', color: '#dc2626', weight: 1.5, dashArray: '4,4',
    fillColor: '#ef4444', fillOpacity: 0.25
  }).bindPopup('<strong>Минные поля и проволочные заграждения (осень 1942 г.)</strong>')
    .addTo(quarterGroup);

  L.polyline([[48.71530,44.53275],[48.71568,44.53205],[48.71605,44.53145]], {
    pane: 'st1942Pane', color: '#2563eb', weight: 3, dashArray: '3,6'
  }).bindPopup('<strong>Ход сообщения от Госмельницы № 4 к Дому Павлова</strong><br>Доставка боеприпасов и эвакуация раненых.')
    .addTo(quarterGroup);

  // ============ 4. Немецкий аэроснимок 1943 (растровый слой) ============
  const aerial1943Overlay = L.imageOverlay(
    CITY_DATA.photos.aerial1943big,
    [[48.7118, 44.5245], [48.7196, 44.5378]],
    { pane: 'aerialAnnotPane', opacity: 0.95 }
  );

  // ============ 5. Объекты: судьба застройки ============
  const OBJECTS = {
    pavlov: {
      pos: [48.716086, 44.531389], status: 'rebuilt', color: '#16a34a',
      title: 'Дом Павлова (Дом Облпотребсоюза)',
      sub: 'Волгоград, ул. Советская, 39 / Сталинград, ул. Пензенская, 61',
      statusTxt: 'восстановлен после войны',
      rows: [
        ['Современный адрес', 'Волгоград, Центральный р-н, ул. Советская, 39 (пл. Ленина)'],
        ['Адрес в 1942 г.', 'г. Сталинград, ул. Пензенская, 61, пл. 9-го Января (арх. С. Волошинов)'],
        ['Координаты', '48.716086° N, 44.531389° E'],
        ['Оборона', 'конец сентября — ноябрь 1942 г., 42-й гв. сп 13-й гв. сд (группа Я. Ф. Павлова)']
      ],
      desc: 'Четырёхэтажный дом на перекрёстке Пензенской улицы и площади 9-го Января. 58 дней удерживался группой Я. Ф. Павлова и гарнизоном И. Ф. Афанасьева. После битвы восстановлен, на торце — мемориальная стена (1985 г.).',
      photos: ['pavlov1943', 'pavlov2021', 'pavlov2024', 'scheme_pavlov']
    },
    zabolotny: {
      pos: [48.715470, 44.530860], status: 'lost', color: '#dc2626',
      title: 'Дом Заболотного (Дом Совконтроля)',
      sub: 'Сталинград, ул. Пензенская / Волгоград, Советская, 37',
      statusTxt: 'утрачен — не восстанавливался',
      rows: [
        ['Адрес в 1942 г.', 'г. Сталинград, пл. 9-го Января (Дом Совконтроля)'],
        ['Оборона', 'взвод л-та Н. Е. Заболотного, сентябрь — ноябрь 1942 г.']
      ],
      desc: 'Соседний 4-этажный дом западнее Дома Павлова. Оборонялся взводом Н. Е. Заболотного. Сильно разрушен в ходе боёв и после войны не восстанавливался — на его месте сейчас сквер у Дома Павлова.',
      photos: ['aerial_annot']
    },
    mill: {
      pos: [48.715220, 44.533070], status: 'ruin', color: '#d97706',
      title: 'Госмельница № 4 (мельница Гергардта)',
      sub: 'Волгоград, ул. Маршала Чуйкова, 47а',
      statusTxt: 'сохранены руины',
      rows: [
        ['Адрес в 1942 г.', 'г. Сталинград, ул. Пензенская (паровая мельница Гергардта, 1899 г.)'],
        ['Оборона', 'сентябрь — ноябрь 1942 г., опорный пункт и КП батальона 42-го гв. сп']
      ],
      photos: ['aerial_circles'],
      desc: 'Пятиэтажное здание паровой мельницы — ключевой узел Пензенского опорного пункта. После битвы законсервировано как памятник: руины без реставрации сохранены до настоящего времени рядом с музеем-панорамой «Сталинградская битва».'
    },
    gruzchikov: {
      pos: [48.694674, 44.495311], status: 'kept', color: '#16a34a',
      title: 'Дом грузчиков (ул. Рабоче-Крестьянская, 22)',
      sub: 'Волгоград, Ворошиловский р-н, ул. Рабоче-Крестьянская, 22 / Огарёва, 10–12',
      statusTxt: 'сохранился, восстановлен к 1947 г.',
      rows: [
        ['Постройка', 'середина 1930-х гг., поздний конструктивизм; архитекторы в источниках расходятся: ВООПИиК — Коваленко и Иванов, Википедия — Коваленко и Летюшов (1935–1937 гг.)'],
        ['Адрес', 'угол ул. Рабоче-Крестьянской и Огарёва — дом работников речного порта'],
        ['Судьба', 'уцелел в битве, восстановлен по довоенному облику: ВООПИиК — арх. А. И. Куренной, 1947 г.; Википедия — арх. А. В. Куровской, 1945–1947 гг.']
      ],
      desc: 'Один из «домов специалистов» довоенного Сталинграда: на первом этаже — ресторан «Грузия», магазины. Редкий пример здания, пережившего битву в боевых кварталах южной части города. Ныне — бизнес-пространство.',
      photos: []
    },
    kommunal: {
      pos: [48.693680, 44.495080], status: 'kept', color: '#16a34a',
      title: 'Дом коммунальщиков (дом консервщиков), Огарёва, 7',
      sub: 'Волгоград, ул. Огарёва, 7 / Рабоче-Крестьянская, 23 — напротив Дома грузчиков',
      statusTxt: 'уцелел в битве',
      rows: [
        ['Постройка', '1938–1939 гг. (по данным реестра памятников — «дом коммунальщиков» 1938/1939 г.)'],
        ['Адрес', 'ул. Огарёва, 7 — угол с Рабоче-Крестьянской, через дорогу от Дома грузчиков'],
        ['Подтверждено', 'дом построен до войны и уцелел в битве: по аэрофотосъёмке марта 1943 г. сохранились крыши; известен снимок советских автоматчиков с ППШ на крыше (конец января 1943 г., после освобождения района)']
      ],
      desc: 'Здание, которое преподаватель предложила добавить в атлас как «дом напротив дома грузчика». Сохранность дома подтверждена аэрофотосъёмкой 1943 г.; участие здания в боях сентября 1942 г. как опорного пункта в открытых источниках прямо не описано и требует проверки в архивах — в карточке приведены только подтверждённые сведения.',
      photos: [],
    },
    ogareva5: {
      pos: [48.693430, 44.495330], status: 'kept', color: '#16a34a',
      title: 'Особняк на ул. Огарёва, 5',
      sub: 'Волгоград, ул. Огарёва, 5 — царицынский особняк',
      statusTxt: 'уцелел',
      rows: [['Постройка', 'конец XIX — начало XX в. (дореволюционный Царицын)']],
      desc: 'Сохранившийся царицынский особняк в Ворошиловском районе. По кадрам аэрофотосъёмки марта 1943 г. дом пострадал незначительно — уцелели даже крыши.',
      photos: [],
    },
    elevator: {
      pos: [48.681075, 44.489200], status: 'kept', color: '#16a34a',
      title: 'Сталинградский элеватор',
      sub: 'Волгоград, Ворошиловский р-н',
      statusTxt: 'сохранился, восстановлен',
      rows: [
        ['Бои', '16–22 сентября 1942 г. — 35-я гв. сд, 92-я сбр, 10-я отдельная стрелковая бригада; 10-я дивизия НКВД в те же дни вела бои у вокзала']
      ],
      desc: 'Самое высокое довоенное здание города. Штурмовали части 24-й танковой дивизии 48-го корпуса 4-й танковой армии вермахта; в ночь на 23 сентября 1942 г. защитники оставили здание (по Википедии; Полк.рф описывает ночной прорыв после обстрела 21 сентября, точную дату не называя). Восстановлен после войны.',
      photos: [],
    },
    vokzal: {
      pos: [48.710000, 44.514000], status: 'rebuilt', color: '#16a34a',
      title: 'Вокзал Сталинград-I',
      sub: 'Волгоград, Привокзальная пл.',
      statusTxt: 'разрушен, восстановлен',
      rows: [['Бои', 'сентябрь 1942 г. — вокзал 13 раз переходил из рук в руки']],
      desc: 'Вокзал и привокзальная площадь — одна из самых горячих точек центральной части города. Разрушен в ходе боёв, восстановлен после войны.',
      photos: [],
    },
    universmag: {
      pos: [48.708597, 44.516501], status: 'kept', color: '#16a34a',
      title: 'Центральный универмаг',
      sub: 'Волгоград, пл. Павших Борцов, 2',
      statusTxt: 'сохранился',
      rows: [['Событие', '31 января 1943 г. — в подвале универмага взят в плен фельдмаршал Ф. Паулюс']],
      desc: 'Довоенное здание универмага на площади Павших Борцов. 31 января 1943 г. в его подвале сдался в плен командующий 6-й армией Ф. Паулюс.',
      photos: [],
    }
  };

  const objectsGroup = L.featureGroup();
  stalingrad1942VectorGroup.addTo(map);
  frontLineGroup.addTo(map);
  Object.entries(OBJECTS).forEach(([key, o]) => {
    const m = L.circleMarker(o.pos, {
      pane: 'objectsPane', renderer: objectsMarkerRenderer,
      radius: 7, color: '#ffffff', weight: 2, fillColor: o.color, fillOpacity: 1
    }).addTo(objectsGroup);
    m.bindTooltip(`<strong>${o.title}</strong><br>${o.statusTxt}`, { direction: 'top' });
    m.on('click', () => showObjectCard(key));
  });

  // ============ 6. Карточка объекта ============
  function showObjectCard(key) {
    const o = OBJECTS[key];
    if (!o) return;
    document.getElementById('cardTitle').textContent = o.title;
    document.getElementById('cardSub').textContent = o.sub;
    const statusColors = { kept: '#16a34a', rebuilt: '#16a34a', ruin: '#d97706', lost: '#dc2626' };
    let html = '';
    html += `<div style="margin-bottom:4px;"><span class="status-chip" style="background:${statusColors[o.status]}22;color:${statusColors[o.status]};border:1px solid ${statusColors[o.status]}55;">${o.statusTxt}</span></div>`;
    html += '<table class="info-table">';
    o.rows.forEach(r => html += `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`);
    html += '</table>';
    html += `<div style="font-size:12.5px;line-height:1.45;">${o.desc}</div>`;
    (o.photos || []).forEach(ph => {
      const caps = {
        pavlov1943: '<strong>Дом Павлова после окончания битвы, 1943 г.</strong><br>Источник: РГВА / Wikimedia Commons (<a href="https://en.wikipedia.org/wiki/File:Pavlov%27s_House.jpg" target="_blank" rel="noopener noreferrer">карточка файла</a>).',
        pavlov2021: '<strong>Современный вид со стороны ул. Советской, 2021 г.</strong><br>Мемориальная стена-памятник (1985 г.). Фото: Bestalex, CC BY-SA 4.0 (<a href="https://commons.wikimedia.org/wiki/File:Volgograd._View_of_Pavlov%27s_House_from_Sovetskaya_Street_(January_2021).jpg" target="_blank" rel="noopener noreferrer">источник</a>).',
        pavlov2024: '<strong>Вид со стороны площади Ленина (бывш. пл. 9-го Января), 2024 г.</strong><br>Ансамбль площади, колоннада и мемориальный барельеф.',
        scheme_pavlov: '<strong>Схема обороны участка «Дом Павлова»</strong><br>Копия схемы сержанта Я. Ф. Павлова (13-я гв. сд): огневые точки, минные поля, ходы сообщения и контрудар 25.11.1942.',
        aerial_annot: '<strong>Аэроснимок 1943 г. с разметкой</strong><br>Дом Заболотного и Дом Павлова (стрелки).',
        aerial_circles: '<strong>Аэроснимок квартала</strong><br>1–2 — дома Павлова и Заболотного, 3 — мельница.',
      };
      const img = CITY_DATA.photos[ph];
      if (!img) return;
      html += `<div class="photo-card"><img src="${img}" alt="Иллюстрация: ${o.title}" loading="lazy" onerror="this.closest('.photo-card').style.display='none'"><div class="photo-caption">${caps[ph] || ''}</div></div>`;
    });
    html += `<div style="font-size:11px;color:var(--text-muted);">Источники: <a href="https://volmap.ru/stalingrad43-map" target="_blank" rel="noopener noreferrer">volmap.ru</a>, <a href="https://voopiik34.ru/object/dom-gruzchikov-zhiloj-dom-restoran-gruziya-upravlenie-rechnogo-porta-g-volgograd-voroshilovskij-rajon-ul-raboche-krestyanskaya-22/" target="_blank" rel="noopener noreferrer">ВООПИиК (Дом грузчиков)</a>, <a href="http://stalingrad1942-1943.ru/taxonomy/term/2988" target="_blank" rel="noopener noreferrer">stalingrad1942-1943.ru</a>, <a href="https://bloknot-volgograd.ru/news/togda-i-seychas-zhiloy-dom-v-volgograde-perezhivsh-1369356" target="_blank" rel="noopener noreferrer">bloknot-volgograd.ru</a>, <a href="https://www.volgadmin.ru/content/files/3444077191-Streets.csv" target="_blank" rel="noopener noreferrer">реестр улиц Волгограда</a>, <a href="https://www.polkrf.ru/" target="_blank" rel="noopener noreferrer">Полк.рф</a></div>`;
    document.getElementById('cardBody').innerHTML = html;
    document.getElementById('objectCard').classList.remove('hidden');
  }

  // Маркер Дома Павлова.
  const pavlovMarker = L.circleMarker([48.716086, 44.531389], {
    pane: 'objectsPane', renderer: objectsMarkerRenderer,
    radius: 9, color: '#ffffff', weight: 2.5, fillColor: '#991b1b', fillOpacity: 1
  }).addTo(map);
  pavlovMarker.bindTooltip('Дом Павлова — нажмите для открытия карточки', { direction: 'top' });
  pavlovMarker.on('click', () => showObjectCard('pavlov'));

  // ============ 7. Навигация ============
  const NAV_TARGETS = {
    pavlov:    { coords: [48.716086, 44.531389], zoom: 18 },
    zabolotny: { coords: [48.715470, 44.530860], zoom: 18 },
    mill:      { coords: [48.715220, 44.533070], zoom: 18 },
    square:    { coords: [48.716400, 44.530350], zoom: 17 },
    ogareva:   { coords: [48.694400, 44.495200], zoom: 18 },
    kommunal:  { coords: [48.693680, 44.495080], zoom: 18 },
    elevator:  { coords: [48.681075, 44.489200], zoom: 17 },
    vokzal:    { coords: [48.710000, 44.514000], zoom: 17 },
    mamayev:   { coords: [48.742400, 44.536900], zoom: 16 },
    stz:       { coords: [48.793800, 44.602900], zoom: 15 }
  };
  document.getElementById('locSelect').addEventListener('change', e => {
    const key = e.target.value;
    const target = NAV_TARGETS[key];
    if (!target) return;
    map.flyTo(target.coords, target.zoom, { duration: 0.8 });
    const cardsByTarget = {
      pavlov: 'pavlov', zabolotny: 'zabolotny', mill: 'mill',
      ogareva: 'gruzchikov', kommunal: 'kommunal', elevator: 'elevator', vokzal: 'vokzal'
    };
    if (cardsByTarget[key]) showObjectCard(cardsByTarget[key]);
    else document.getElementById('objectCard').classList.add('hidden');
  });
  document.getElementById('btnFlyPavlov').addEventListener('click', () => {
    map.flyTo(NAV_TARGETS.pavlov.coords, 18, { duration: 0.8 });
    showObjectCard('pavlov');
  });
  document.getElementById('btnOverview').addEventListener('click', () => {
    document.getElementById('objectCard').classList.add('hidden');
    map.flyTo([48.7158, 44.5350], 13, { duration: 0.7 });
  });
  function parseCoordinateInput(value) {
    const parts = value.trim() ? value.trim().split(/[,;\s]+/).map(Number) : [];
    const valid = parts.length === 2 && parts.every(Number.isFinite) &&
      parts[0] >= -90 && parts[0] <= 90 && parts[1] >= -180 && parts[1] <= 180;
    return valid ? parts : null;
  }

  const coordInput = document.getElementById('coordInput');
  const coordHelpEl = document.getElementById('coordHelp');
  const COORD_HINT = 'Введите две координаты: широту от −90 до 90 и долготу от −180 до 180.';
  coordInput.addEventListener('input', () => {
    coordInput.removeAttribute('aria-invalid');
    if (coordHelpEl.classList.contains('error')) {
      coordHelpEl.textContent = COORD_HINT;
      coordHelpEl.className = 'coord-feedback';
    }
  });
  coordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnGoCoord').click();
  });
  document.getElementById('btnGoCoord').addEventListener('click', () => {
    const parts = parseCoordinateInput(coordInput.value);
    if (!parts) {
      coordInput.setAttribute('aria-invalid', 'true');
      coordInput.focus();
      coordHelpEl.textContent = 'Ошибка: нужны широта от −90 до 90 и долгота от −180 до 180. Пример: 48.716086, 44.531389';
      coordHelpEl.className = 'coord-feedback error';
      return;
    }
    coordInput.removeAttribute('aria-invalid');
    coordHelpEl.textContent = 'Перехожу к точке ' + parts[0].toFixed(6) + ', ' + parts[1].toFixed(6) + '…';
    coordHelpEl.className = 'coord-feedback ok';
    map.flyTo([parts[0], parts[1]], 18);
  });

  (function initLocSelectFull() {
    const sel = document.getElementById('locSelect');
    const full = document.getElementById('locSelectFull');
    if (!sel || !full) return;
    function upd() {
      const opt = sel.options[sel.selectedIndex];
      full.textContent = opt ? opt.textContent : '';
    }
    sel.addEventListener('change', upd);
    upd();
  })();

  const sidebarLeft = document.getElementById('sidebarLeft');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnToggleCoords = document.getElementById('btnToggleCoords');
  const coordControls = document.getElementById('coordControls');

  (function syncSidebarWithTopBar() {
    const sb = document.getElementById('sidebarLeft');
    const tb = document.querySelector('.top-bar');
    if (!sb || !tb) return;
    const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
    function apply() {
      if (isMobile()) { sb.style.top = ''; sb.style.maxHeight = ''; return; }
      const barBottom = Math.ceil(tb.getBoundingClientRect().bottom);
      const top = Math.max(128, barBottom + 10);
      sb.style.top = top + 'px';
      sb.style.maxHeight = 'calc(100vh - ' + (top + 44) + 'px)';
    }
    if (window.ResizeObserver) new ResizeObserver(apply).observe(tb);
    window.addEventListener('resize', apply);
    window.addEventListener('load', apply);
    apply();
  })();
  btnToggleSidebar.addEventListener('click', () => {
    const isOpen = sidebarLeft.classList.toggle('mobile-open');
    btnToggleSidebar.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      coordControls.classList.remove('is-open');
      btnToggleCoords.setAttribute('aria-expanded', 'false');
    }
  });
  btnToggleCoords.addEventListener('click', () => {
    const isOpen = coordControls.classList.toggle('is-open');
    btnToggleCoords.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      sidebarLeft.classList.remove('mobile-open');
      btnToggleSidebar.setAttribute('aria-expanded', 'false');
      coordInput.focus();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      sidebarLeft.classList.remove('mobile-open');
      coordControls.classList.remove('is-open');
      btnToggleSidebar.setAttribute('aria-expanded', 'false');
      btnToggleCoords.setAttribute('aria-expanded', 'false');
      document.getElementById('objectCard').classList.add('hidden');
    }
  });

  // ============ 8. Переключение подложек и слоёв ============
  document.querySelectorAll('input[name="baseMap"]').forEach(radio => {
    radio.addEventListener('change', () => setEra(currentEra));
  });

  document.getElementById('chkAerial42').addEventListener('change', e => {
    setEra(e.target.checked ? '1942' : 'modern');
  });
  document.getElementById('chkAerial43').addEventListener('change', e => {
    setEra(e.target.checked ? '1943' : 'modern');
  });

  document.getElementById('chkVector1942').addEventListener('change', e => {
    if (e.target.checked) stalingrad1942VectorGroup.addTo(map);
    else map.removeLayer(stalingrad1942VectorGroup);
  });
  document.getElementById('chkFrontLine').addEventListener('change', e => {
    if (e.target.checked) frontLineGroup.addTo(map);
    else map.removeLayer(frontLineGroup);
  });
  document.getElementById('chkVecLabels').addEventListener('change', e => {
    if (e.target.checked) map.addLayer(vecLabelsGroup);
    else map.removeLayer(vecLabelsGroup);
  });
  document.getElementById('chkQuarter').addEventListener('change', e => {
    if (e.target.checked) quarterGroup.addTo(map);
    else map.removeLayer(quarterGroup);
  });
  document.getElementById('chkAerial1943').addEventListener('change', e => {
    if (e.target.checked) aerial1943Overlay.addTo(map);
    else map.removeLayer(aerial1943Overlay);
  });
  document.getElementById('chkObjects').addEventListener('change', e => {
    const visible = e.target.checked;
    const card = document.getElementById('objectCard');
    if (visible) {
      if (window.matchMedia('(max-width: 900px)').matches) {
        sidebarLeft.classList.remove('mobile-open');
        btnToggleSidebar.setAttribute('aria-expanded', 'false');
      }
      if (map.hasLayer(pavlovMarker)) map.removeLayer(pavlovMarker);
      objectsGroup.addTo(map);
      const bounds = objectsGroup.getBounds();
      if (bounds.isValid()) {
        const padding = window.matchMedia('(max-width: 900px)').matches ? [30, 30] : [48, 48];
        map.fitBounds(bounds, { padding, maxZoom: 13, animate: false });
      }
    } else {
      map.removeLayer(objectsGroup);
      if (!map.hasLayer(pavlovMarker)) pavlovMarker.addTo(map);
      card.classList.add('hidden');
    }
  });

  document.getElementById('rngOpacity').addEventListener('input', e => {
    const v = Number(e.target.value) / 100;
    histPane.style.opacity = v;
    eraTilesPane.style.opacity = Math.min(1, v + 0.45);
    document.getElementById('lblOpacity').textContent = e.target.value + '%';
  });

  // ============ 9. Шторка сравнения ============
  const chkSwipe = document.getElementById('chkSwipe');
  const rngSwipe = document.getElementById('rngSwipe');
  const swipeRow = document.getElementById('swipeRow');
  const swipeDivider = document.getElementById('swipeDivider');
  let swipeFlipped = false;

  function updateSwipeClip() {
    if (!chkSwipe.checked) {
      swipeDivider.style.display = 'none';
      applyPaneClip(null);
      return;
    }
    swipeDivider.style.display = 'block';
    const pct = Number(rngSwipe.value) / 100;
    const size = map.getSize();
    const splitX = Math.round(size.x * pct);
    swipeDivider.style.left = splitX + 'px';
    const leftTag = swipeDivider.querySelector('.swipe-tag-left');
    const rightTag = swipeDivider.querySelector('.swipe-tag-right');
    const eraYear = currentEra === '1943' ? '1943' : '1942';
    const stTag = 'Сталинград, ' + eraYear;
    if (swipeFlipped) {
      leftTag.textContent = 'Волгоград'; leftTag.style.background = 'rgba(24,24,27,0.85)';
      rightTag.textContent = stTag; rightTag.style.background = 'rgba(153,27,27,0.9)';
    } else {
      leftTag.textContent = stTag; leftTag.style.background = 'rgba(153,27,27,0.9)';
      rightTag.textContent = 'Современный Волгоград'; rightTag.style.background = 'rgba(24,24,27,0.85)';
    }
    const sb = document.querySelector('.sidebar-left');
    const sbRight = (sb && getComputedStyle(sb).display !== 'none') ? sb.getBoundingClientRect().right : 0;
    leftTag.style.display = 'block';
    const tagW = leftTag.offsetWidth;
    leftTag.style.display = (splitX < 430 || splitX - 28 - tagW < sbRight + 10) ? 'none' : 'block';
    rightTag.style.display = splitX > size.x - 470 ? 'none' : 'block';
    applyPaneClip(splitX);
  }

  function applyPaneClip(splitX) {
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint(map.getSize());
    const sheetNW = map.latLngToLayerPoint([SHEET[1][0], SHEET[0][1]]);
    const sheetSE = map.latLngToLayerPoint([SHEET[0][0], SHEET[1][1]]);
    let x0 = Math.max(nw.x, sheetNW.x), x1 = Math.min(se.x, sheetSE.x);
    let y0 = Math.max(nw.y, sheetNW.y), y1 = Math.min(se.y, sheetSE.y);
    if (splitX !== null && splitX !== undefined) {
      if (swipeFlipped) x0 = Math.max(x0, nw.x + splitX);
      else x1 = Math.min(x1, nw.x + splitX);
    }
    const empty = (x1 <= x0 || y1 <= y0);
    const clipVal = empty ? 'rect(0,0,0,0)' : `rect(${Math.round(y0)}px, ${Math.round(x1)}px, ${Math.round(y1)}px, ${Math.round(x0)}px)`;
    histPane.style.clip = clipVal;
    eraTilesPane.style.clip = clipVal;
    aerialAnnotPane.style.clip = clipVal;
  }

  let swipeClipScheduled = false;
  function scheduleSwipeClip() {
    if (swipeClipScheduled) return;
    swipeClipScheduled = true;
    requestAnimationFrame(() => {
      swipeClipScheduled = false;
      updateSwipeClip();
    });
  }

  swipeDivider.addEventListener('pointerdown', function (e) {
    if (!chkSwipe.checked) return;
    e.preventDefault();
    try { swipeDivider.setPointerCapture(e.pointerId); } catch (err) {}
    function onMove(ev) {
      const rect = document.getElementById('map').getBoundingClientRect();
      const min = Number(rngSwipe.min), max = Number(rngSwipe.max);
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      pct = Math.min(max, Math.max(min, pct));
      rngSwipe.value = String(Math.round(pct));
      scheduleSwipeClip();
    }
    function onUp() {
      swipeDivider.removeEventListener('pointermove', onMove);
      swipeDivider.removeEventListener('pointerup', onUp);
      swipeDivider.removeEventListener('pointercancel', onUp);
    }
    swipeDivider.addEventListener('pointermove', onMove);
    swipeDivider.addEventListener('pointerup', onUp);
    swipeDivider.addEventListener('pointercancel', onUp);
  });

  function hideVecLabelsUnderPanels() {
    const panels = [document.getElementById('sidebarLeft'), document.getElementById('objectCard')].filter(function (p) {
      if (!p) return false;
      const st = getComputedStyle(p);
      return st.display !== 'none' && !p.classList.contains('hidden');
    });
    document.querySelectorAll('.leaflet-marker-pane .vec-label, .leaflet-marker-pane .vec-label-sm, .leaflet-st1942-pane .vec-label, .leaflet-st1942-pane .vec-label-sm').forEach(function (el) {
      if (!panels.length) { el.style.visibility = ''; return; }
      const r = el.getBoundingClientRect();
      const overlap = panels.some(function (sb) {
        const s = sb.getBoundingClientRect();
        return r.left < s.right + 6 && r.right > s.left - 6 &&
               r.top < s.bottom + 6 && r.bottom > s.top - 6;
      });
      el.style.visibility = overlap ? 'hidden' : '';
    });
  }
  function scheduleHideVecLabels() {
    requestAnimationFrame(hideVecLabelsUnderPanels);
  }
  map.on('move zoom resize moveend zoomend', scheduleHideVecLabels);
  window.addEventListener('resize', scheduleHideVecLabels);
  btnToggleSidebar.addEventListener('click', () => setTimeout(scheduleHideVecLabels, 60));
  if (window.MutationObserver) {
    new MutationObserver(scheduleHideVecLabels).observe(document.getElementById('objectCard'), { attributes: true, attributeFilter: ['class'] });
  }

  chkSwipe.addEventListener('change', () => {
    swipeRow.style.display = chkSwipe.checked ? 'flex' : 'none';
    if (chkSwipe.checked) {
      if (currentEra === 'modern') setEra('1942');
    }
    if (chkSwipe.checked && !map.hasLayer(stalingrad1942VectorGroup)) {
      stalingrad1942VectorGroup.addTo(map);
      document.getElementById('chkVector1942').checked = true;
    }
    updateSwipeClip();
  });
  rngSwipe.addEventListener('input', scheduleSwipeClip);
  map.on('move zoom resize', scheduleSwipeClip);
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      scheduleSwipeClip();
    });
  }, { passive: true });

  document.getElementById('btnSwapSides').addEventListener('click', () => {
    swipeFlipped = !swipeFlipped;
    updateSwipeClip();
  });

  histPane.style.opacity = 0.92;

  map.whenReady(updateSwipeClip);
  updateSwipeClip();

  map.on('mousemove', e => {
    document.getElementById('mouseCoords').textContent =
      `Курсор: ${e.latlng.lat.toFixed(5)}° N, ${e.latlng.lng.toFixed(5)}° E (EPSG:4326)`;
  });
  document.getElementById('btnCloseCard').addEventListener('click', () => {
    document.getElementById('objectCard').classList.add('hidden');
  });

}).catch(function (error) {
  setupFallbackUi(error);
});