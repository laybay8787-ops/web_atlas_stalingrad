const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'city-data.js');
const DIR = path.join(__dirname, 'img');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const code = fs.readFileSync(SRC, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const data = sandbox.window.CITY_DATA;
if (!data || !data.photos) {
  console.error('CITY_DATA.photos не найден');
  process.exit(1);
}

let extracted = 0;
for (const [key, value] of Object.entries(data.photos)) {
  if (typeof value !== 'string') continue;
  if (!value.startsWith('data:image/')) {
    console.log(`= ${key}: уже URL, пропуск`);
    continue;
  }
  const m = value.match(/^data:image\/([^;]+);base64,(.+)$/s);
  if (!m) {
    console.warn(`! ${key}: не удалось распарсить`);
    continue;
  }
  let ext = m[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';
  const filename = `${key}.${ext}`;
  const buf = Buffer.from(m[2], 'base64');
  fs.writeFileSync(path.join(DIR, filename), buf);
  data.photos[key] = `img/${filename}`;
  extracted++;
  console.log(`+ ${key} -> img/${filename} (${buf.length} байт)`);
}

fs.writeFileSync(SRC, 'window.CITY_DATA = ' + JSON.stringify(data) + ';\n');
console.log(`\nГотово. Извлечено: ${extracted} картинок.`);
