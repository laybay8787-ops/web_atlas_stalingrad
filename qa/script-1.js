
    (function () {
      'use strict';
      const cssSources = [
        'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      ];
      const jsSources = [
        'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      ];
      function loadCss(index) {
        return new Promise(function (resolve, reject) {
          if (index >= cssSources.length) { reject(new Error('Не удалось загрузить стили карты')); return; }
          const link = document.createElement('link');
          let settled = false;
          function nextSource() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            link.remove();
            loadCss(index + 1).then(resolve, reject);
          }
          const timer = setTimeout(nextSource, 7000);
          link.rel = 'stylesheet';
          link.href = cssSources[index];
          link.onload = function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
          };
          link.onerror = nextSource;
          document.head.appendChild(link);
        });
      }
      function loadJs(index) {
        return new Promise(function (resolve, reject) {
          if (window.L && typeof window.L.map === 'function') { resolve(window.L); return; }
          if (index >= jsSources.length) { reject(new Error('Все источники библиотеки карты недоступны')); return; }
          const script = document.createElement('script');
          let settled = false;
          function nextSource() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            script.remove();
            loadJs(index + 1).then(resolve, reject);
          }
          const timer = setTimeout(nextSource, 7000);
          script.src = jsSources[index];
          script.async = true;
          script.onload = function () {
            if (settled) return;
            if (window.L && typeof window.L.map === 'function') {
              settled = true;
              clearTimeout(timer);
              resolve(window.L);
            } else nextSource();
          };
          script.onerror = nextSource;
          document.head.appendChild(script);
        });
      }
      window.__leafletReady = Promise.all([loadCss(0), loadJs(0)]).then(function () {
        if (!window.L || typeof window.L.map !== 'function') throw new Error('Библиотека карты не инициализирована');
        return window.L;
      });
      // Обработчик добавляется заранее, чтобы отказ CDN не превращался в необработанное отклонение Promise.
      window.__leafletReady.catch(function () {});
    })();
  