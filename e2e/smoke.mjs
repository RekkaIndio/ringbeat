/**
 * End-to-end smoke test in a real browser.
 *
 *   npm run build && npm run e2e
 *
 * Needs Chromium for Playwright: `npx playwright install chromium`.
 * It starts `vite preview` itself, drives the built app, and writes
 * screenshots and downloaded files to e2e/output/ (git-ignored).
 *
 * The timing check uses an independent oracle: three rhythm strings typed in
 * by hand from the published patterns, not derived from the app's own code.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = new URL('./output/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const failures = [];
let checks = 0;
function check(name, ok, detail = '') {
  checks++;
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? `  [${detail}]` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- helpers that read the files the app produced ----------

function parseMidi(buf) {
  let p = 0;
  const str = (n) => buf.toString('latin1', p, (p += n));
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  const vlq = () => { let v = 0; for (;;) { const b = buf[p++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v; } };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  u32();
  const format = u16(), ntrks = u16(), division = u16();
  let noteOns = 0;
  for (let t = 0; t < ntrks; t++) {
    if (str(4) !== 'MTrk') throw new Error('bad track');
    const end = u32() + p;
    while (p < end) {
      vlq();
      const status = buf[p++];
      if (status === 0xff) { p++; const len = vlq(); p += len; }
      else { if ((status & 0xf0) === 0x90) noteOns++; p += 2; }
    }
  }
  return { format, ntrks, division, noteOns, bytes: buf.length };
}

function parseWav(buf) {
  const ok = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE';
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const dataBytes = buf.readUInt32LE(40);
  let peak = 0;
  for (let i = 44; i + 1 < buf.length; i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)) / 32768);
  return { ok, sampleRate, bits, seconds: dataBytes / 2 / sampleRate, peak, size: buf.length };
}

// ---------- start the preview server ----------

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: 'ignore',
  detached: true,
});
async function stopServer() {
  try { process.kill(-server.pid); } catch { /* already gone */ }
}
process.on('exit', () => { try { process.kill(-server.pid); } catch { /* ignore */ } });

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
  await sleep(250);
  if (i === 59) { console.log('Preview server did not start. Run `npm run build` first.'); await stopServer(); process.exit(2); }
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

const SPY = () => {
  window.__starts = [];
  const original = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...rest) {
    window.__starts.push({ when: when ?? 0, now: this.context.currentTime });
    return original.call(this, when, ...rest);
  };
};

async function newPage(contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(SPY);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return { context, page, problems };
}

const discCount = (page) => page.locator('[data-pulse]').count();
const ringSlider = (page, ring, label) => page.locator(`section[aria-label="Ring ${ring}"] .slider:has(label:text-is("${label}")) input`);

try {
  // =====================================================================
  console.log('\nPhone, light theme');
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const { page } = phone;
  await page.goto(BASE);
  await page.waitForSelector('.dial');

  check('page title names the app', (await page.title()).startsWith('Ringbeat'));
  check('default song draws 15 pulse discs (3 + 7 + 5)', (await discCount(page)) === 15, String(await discCount(page)));
  check('three ring rows are listed', (await page.locator('.ring-row').count()) === 3);
  check('no horizontal scrolling on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('light theme uses the fog-blue ground', bg === 'rgb(228, 233, 238)', bg);
  await page.screenshot({ path: `${OUT}phone-light.png`, fullPage: true });

  // ---- accessible names ----
  const unnamed = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, select, input')) {
      let name = el.getAttribute('aria-label') || '';
      if (!name && el.id) name = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? '';
      if (!name) name = el.textContent ?? '';
      if (!name.trim()) bad.push(el.outerHTML.slice(0, 80));
    }
    return bad;
  });
  check('every button, select and slider has an accessible name', unnamed.length === 0, unnamed.join(' | '));
  check('the dial has a text description', ((await page.locator('svg.dial').getAttribute('aria-label')) ?? '').includes('Ring 1, kick: 3 pulses in 8 steps'));

  // ---- keyboard: first Tab stop is the hub, Enter plays ----
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  check('the first Tab stop is the Play button', focused === 'Play', String(focused));
  await page.keyboard.press('Enter');

  // ---- audio scheduling in a real browser ----
  await page.waitForFunction(() => window.__starts.length >= 30, null, { timeout: 10000 }).catch(() => {});
  const label = await page.locator('.hub').getAttribute('aria-label');
  check('hub switches to Stop while playing', label === 'Stop', String(label));
  const ctxState = await page.evaluate(() => window.__starts.length);
  check('notes are being scheduled on the Web Audio clock', ctxState >= 30, `${ctxState} starts`);

  const starts = await page.evaluate(() => window.__starts);
  check('no note is ever started in the past', starts.every((s) => s.when >= s.now - 1e-6));
  const t0 = starts[0].when;
  const bar = (4 * 60) / 104;
  const firstBar = starts.filter((s) => s.when - t0 < bar - 0.005).map((s) => s.when - t0).sort((a, b) => a - b);
  // Independent oracle: hand-typed patterns for the default song at 104 bpm.
  const hand = [
    { pattern: 'x..x..x.', steps: 8 }, // kick, E(3,8)
    { pattern: 'x.xx.x.xx.x.', steps: 12 }, // hat, E(7,12)
    { pattern: '..x..x..x..x..x.', steps: 16 }, // clave, E(5,16) rotated right by 2
  ];
  const expected = hand
    .flatMap(({ pattern, steps }) => [...pattern].flatMap((c, i) => (c === 'x' ? [((i * 4) / steps) * (60 / 104)] : [])))
    .sort((a, b) => a - b);
  const maxErr = firstBar.length === expected.length ? Math.max(...firstBar.map((v, i) => Math.abs(v - expected[i]))) : Infinity;
  check('first bar holds exactly 15 notes', firstBar.length === 15, String(firstBar.length));
  check('every note lands within 2 ms of the hand-checked rhythm', maxErr < 0.002, `max error ${(maxErr * 1000).toFixed(3)} ms`);
  const gaps = starts.slice(1).map((s, i) => s.when - starts[i].when);
  check('scheduled times never run backwards', gaps.every((g) => g >= -1e-9));

  // ---- the playhead and hit pops ----
  const angles = [];
  for (let i = 0; i < 4; i++) {
    angles.push(await page.evaluate(() => Number(/rotate\(([-\d.e]+)/.exec(document.querySelector('.playhead').getAttribute('transform'))?.[1])));
    await sleep(180);
  }
  check('the playhead sweeps round the dial', new Set(angles.map((a) => a.toFixed(0))).size >= 3, angles.map((a) => a.toFixed(0)).join(','));
  const popRatio = await page.evaluate(() => new Promise((resolve) => {
    let max = 1;
    const t0 = performance.now();
    const loop = () => {
      for (const el of document.querySelectorAll('[data-pulse]')) max = Math.max(max, Number(el.getAttribute('r')) / Number(el.dataset.baseR));
      if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else resolve(max);
    };
    loop();
  }));
  check('discs swell when the playhead hits them', popRatio > 1.4, popRatio.toFixed(2));
  await page.screenshot({ path: `${OUT}phone-playing.png` });

  // ---- Space toggles play from the page body ----
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await sleep(150);
  check('Space stops playback', (await page.locator('.hub').getAttribute('aria-label')) === 'Play');
  const afterStop = await page.evaluate(() => window.__starts.length);
  await sleep(500);
  check('no new notes are scheduled after stopping', (await page.evaluate(() => window.__starts.length)) === afterStop);
  await page.keyboard.press('Space');
  await page.waitForFunction((n) => window.__starts.length > n, afterStop, { timeout: 5000 });
  check('Space starts playback again', (await page.locator('.hub').getAttribute('aria-label')) === 'Stop');

  // ---- floating button when the dial has scrolled away ----
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForSelector('.fab', { timeout: 3000 }).catch(() => {});
  check('a floating Stop button appears once the dial scrolls away', (await page.locator('.fab').count()) === 1 && (await page.locator('.fab').getAttribute('aria-label')) === 'Stop');
  await page.locator('.fab').click();
  await sleep(150);
  check('the floating button stops playback', (await page.locator('.hub').getAttribute('aria-label')) === 'Play');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.querySelector('.fab'), null, { timeout: 3000 }).catch(() => {});
  check('it disappears when the dial is back in view', (await page.locator('.fab').count()) === 0);
  await page.locator('.hub').click();
  await sleep(200);

  // ---- editing while it plays ----
  await ringSlider(page, 1, 'Pulses').focus();
  await page.keyboard.press('ArrowRight');
  await sleep(100);
  check('a keyboard nudge adds a pulse disc live', (await discCount(page)) === 16, String(await discCount(page)));
  await ringSlider(page, 1, 'Steps').fill('5');
  const p1 = await ringSlider(page, 1, 'Pulses').inputValue();
  const r1 = await page.locator('section[aria-label="Ring 1"] .slider:has(label:text-is("Rotate")) input').getAttribute('max');
  check('shrinking steps pulls pulses and rotation back in range', Number(p1) <= 5 && Number(r1) === 4, `pulses ${p1}, rotate max ${r1}`);
  await page.keyboard.press('Space').catch(() => {});
  await page.locator('.hub').click();
  await sleep(200);

  // ---- URL stays a share link ----
  await sleep(300);
  const hash = await page.evaluate(() => location.hash);
  check('the address bar holds a v1 share link', /^#v1-[A-Za-z0-9_-]+$/.test(hash), hash);

  // ---- presets, add, mute, remove ----
  await page.selectOption('#preset', 'three-four');
  await sleep(100);
  check('the 3-against-4 preset loads (84 bpm, 2 rings, 7 discs)',
    (await page.locator('.bpm').textContent()) === '84' && (await page.locator('.ring-row').count()) === 2 && (await discCount(page)) === 7);
  for (let i = 0; i < 6; i++) { if (await page.getByRole('button', { name: 'Add ring' }).isEnabled()) await page.getByRole('button', { name: 'Add ring' }).click(); }
  const stepCounts = await page.locator('section.ring-row .slider:has(label:text-is("Steps")) output').allTextContents();
  check('added rings get different step counts', new Set(stepCounts).size === stepCounts.length, stepCounts.join(','));
  check('rings stop at six and the Add button disables', (await page.locator('.ring-row').count()) === 6 && (await page.getByRole('button', { name: 'Add ring' }).isDisabled()));
  await page.screenshot({ path: `${OUT}phone-six-rings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Mute' }).first().click();
  check('muting dims the ring', (await page.locator('.dial .ring.is-muted').count()) === 1);
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /^Remove ring/ }).first().click();
  check('the last ring cannot be removed', (await page.locator('.ring-row').count()) === 1 && (await page.getByRole('button', { name: 'Remove ring 1' }).isDisabled()));

  check('no console errors or page errors on the phone run', phone.problems.length === 0, phone.problems.join(' | '));
  await phone.context.close();

  // =====================================================================
  console.log('\nShare link, round trip in a fresh browser');
  const a = await newPage({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await a.page.goto(BASE);
  await a.page.waitForSelector('.dial');
  await a.page.selectOption('#preset', 'bell');
  await ringSlider(a.page, 2, 'Rotate').fill('3');
  await a.page.getByRole('button', { name: 'Copy link' }).click();
  await a.page.waitForFunction(() => document.querySelector('.status')?.textContent?.includes('copied'));
  const copied = await a.page.evaluate(() => navigator.clipboard.readText());
  check('Copy link puts the full URL on the clipboard', copied.startsWith(BASE) && /#v1-/.test(copied), copied);

  const b = await newPage({ viewport: { width: 1280, height: 800 } });
  await b.page.goto(copied);
  await b.page.waitForSelector('.dial');
  const same = await Promise.all([
    b.page.locator('.bpm').textContent(),
    ringSlider(b.page, 2, 'Rotate').inputValue(),
    b.page.locator('.ring-row').count(),
    discCount(b.page),
  ]);
  const orig = await Promise.all([
    a.page.locator('.bpm').textContent(),
    ringSlider(a.page, 2, 'Rotate').inputValue(),
    a.page.locator('.ring-row').count(),
    discCount(a.page),
  ]);
  check('a second browser opens the identical pattern from the link', JSON.stringify(same) === JSON.stringify(orig), `${JSON.stringify(same)} vs ${JSON.stringify(orig)}`);

  // pasting another link into the address bar of a running page
  await b.page.evaluate((url) => { location.hash = new URL(url).hash; }, await (async () => {
    await a.page.selectOption('#preset', 'bossa');
    await sleep(300);
    return a.page.evaluate(() => location.href);
  })());
  await sleep(200);
  check('changing the hash loads that pattern without a reload', (await b.page.locator('.bpm').textContent()) === '120');

  // a broken link
  const c = await newPage({ viewport: { width: 1280, height: 800 } });
  await c.page.goto(`${BASE}#v1-AAAA`);
  await c.page.waitForSelector('.dial');
  check('a damaged link shows a plain-language notice', (await c.page.locator('.notice').textContent())?.includes("couldn't be read"));
  check('...and falls back to the default pattern', (await discCount(c.page)) === 15);
  await c.page.getByRole('button', { name: 'Dismiss' }).click();
  check('the notice can be dismissed', (await c.page.locator('.notice').count()) === 0);
  check('no errors from share-link handling', [a, b, c].every((x) => x.problems.length === 0), [a, b, c].flatMap((x) => x.problems).join(' | '));
  await c.context.close(); await b.context.close();

  // =====================================================================
  console.log('\nExports');
  await a.page.selectOption('#preset', 'tresillo');
  await sleep(200);
  const bpm = Number(await a.page.locator('.bpm').textContent());
  const [midiDownload] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: 'Download MIDI' }).click()]);
  await midiDownload.saveAs(`${OUT}export.mid`);
  const midi = parseMidi(readFileSync(`${OUT}export.mid`));
  check('MIDI file name carries the tempo', midiDownload.suggestedFilename() === `ringbeat-${bpm}bpm.mid`, midiDownload.suggestedFilename());
  check('MIDI is format 1 at 480 ppq with a tempo track and 3 ring tracks', midi.format === 1 && midi.division === 480 && midi.ntrks === 4, JSON.stringify(midi));
  // tresillo preset: 3 + 8 + 2 pulses per bar, 4 bars exported
  check('MIDI holds every note of four bars (13 per bar)', midi.noteOns === 13 * 4, String(midi.noteOns));

  const [wavDownload] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: 'Download WAV' }).click()]);
  await wavDownload.saveAs(`${OUT}export.wav`);
  const wav = parseWav(readFileSync(`${OUT}export.wav`));
  check('WAV is 16-bit PCM at 44.1 kHz', wav.ok && wav.bits === 16 && wav.sampleRate === 44100, JSON.stringify(wav));
  const wantSeconds = (4 * 4 * 60) / bpm;
  check('WAV lasts exactly four bars', Math.abs(wav.seconds - wantSeconds) < 1 / 44100 + 1e-9, `${wav.seconds}s vs ${wantSeconds}s`);
  check('WAV is audible and does not clip', wav.peak > 0.3 && wav.peak <= 1, wav.peak.toFixed(3));
  check('no errors during export', a.problems.length === 0, a.problems.join(' | '));

  // =====================================================================
  console.log('\nDesktop');
  await a.page.selectOption('#preset', 'drift');
  await a.page.evaluate(() => window.scrollTo(0, 0));
  await a.page.locator('.hub').click();
  await sleep(1300);
  await a.page.screenshot({ path: `${OUT}desktop-light.png` });
  await a.page.locator('.hub').click();
  const stage = await a.page.locator('.stage').boundingBox();
  const controls = await a.page.locator('.controls').boundingBox();
  await a.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(100);
  const stuck = await a.page.locator('.stage').boundingBox();
  check('the dial stays in view while the controls scroll', stuck.y >= -1 && stuck.y < 60 && stuck.y + stuck.height > 400, JSON.stringify(stuck));
  await a.page.evaluate(() => window.scrollTo(0, 0));
  check('desktop puts the dial and controls side by side', stage.x + stage.width <= controls.x + 1, `${JSON.stringify(stage)} ${JSON.stringify(controls)}`);
  await a.context.close();

  // =====================================================================
  console.log('\nDark theme');
  const dark = await newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await dark.page.goto(BASE);
  await dark.page.waitForSelector('.dial');
  const darkBg = await dark.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('dark theme swaps the ground', darkBg === 'rgb(20, 26, 51)', darkBg);
  await dark.page.locator('.hub').click();
  await sleep(900);
  await dark.page.screenshot({ path: `${OUT}desktop-dark.png` });
  check('no errors in dark theme', dark.problems.length === 0, dark.problems.join(' | '));
  await dark.context.close();

  // =====================================================================
  console.log('\nReduced motion');
  const calm = await newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await calm.page.goto(BASE);
  await calm.page.waitForSelector('.dial');
  await calm.page.locator('.hub').click();
  const radii = await calm.page.evaluate(() => new Promise((resolve) => {
    let swelled = false;
    const t0 = performance.now();
    const loop = () => {
      for (const el of document.querySelectorAll('[data-pulse]')) if (Number(el.getAttribute('r')) > Number(el.dataset.baseR) + 1e-9) swelled = true;
      if (performance.now() - t0 < 1200) requestAnimationFrame(loop); else resolve(swelled);
    };
    loop();
  }));
  check('with reduced motion, discs flash instead of swelling', radii === false);
  check('no errors with reduced motion', calm.problems.length === 0, calm.problems.join(' | '));
  await calm.context.close();
} finally {
  await browser.close();
  await stopServer();
}

console.log(`\n${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
