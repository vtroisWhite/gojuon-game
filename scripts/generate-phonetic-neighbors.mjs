import { mkdir, writeFile } from 'node:fs/promises';
import { KANA } from '../src/kana.ts';

const revision = 'f067a4e8be10d818b37b8b9f08de933dae01524b';
const source = 'https://github.com/jiroshimaya/kanasim';
const raw = `https://raw.githubusercontent.com/jiroshimaya/kanasim/${revision}`;
async function read(path) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${raw}/${path}`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}
const [csv, license] = await Promise.all([
  read('src/kanasim/data/biphone/kana_to_phonome_distance.csv'),
  read('LICENSE'),
]);
const reference = new Map();
for (const entry of KANA.filter((entry) => entry.script === 'katakana')) {
  if (!reference.has(entry.pronunciation)) reference.set(entry.pronunciation, entry);
}
const byGlyph = new Map([...reference].map(([reading, entry]) => [entry.glyph, reading]));
const distances = new Map([...reference.keys()].map((reading) => [reading, []]));
const [header, ...lines] = csv.trim().split(/\r?\n/);
if (
  header !== 'kana1,kana2,consonant1,consonant2,vowel1,vowel2,distance_consonant,distance_vowel'
) {
  throw new Error('Unexpected phonetic CSV columns');
}
for (const line of lines) {
  const cells = line.split(',');
  const from = byGlyph.get(cells[0]);
  const to = byGlyph.get(cells[1]);
  if (!from || !to || from === to || reference.get(from).structure !== reference.get(to).structure)
    continue;
  const distance = Number(cells[6]) + Number(cells[7]);
  if (!Number.isFinite(distance)) throw new Error('Invalid phonetic distance');
  distances.get(from).push({ reading: to, distance });
}
const neighbors = Object.fromEntries(
  [...distances].map(([reading, values]) => {
    values.sort((a, b) => a.distance - b.distance || a.reading.localeCompare(b.reading));
    if (values.length < 8) throw new Error(`Missing phonetic neighbors for ${reading}`);
    return [reading, values.slice(0, 8).map((value) => value.reading)];
  }),
);
await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
await mkdir(new URL('../public/licenses/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../src/data/phonetic-neighbors.json', import.meta.url),
  JSON.stringify({ source, revision, neighbors }, null, 2) + '\n',
);
await writeFile(new URL('../public/licenses/kanasim-LICENSE.txt', import.meta.url), license);
await writeFile(
  new URL('../public/licenses/kanasim-NOTICE.txt', import.meta.url),
  `Phonetic neighbor data derived from jiroshimaya/kanasim\n${source}\nRevision: ${revision}\nLicense: Apache-2.0 (kanasim-LICENSE.txt)\nModified: restricted to supported readings and structures; eight ranked neighbors per reading.\n`,
);
console.log(`Generated ${reference.size} reading neighborhoods (8 candidates each).`);
