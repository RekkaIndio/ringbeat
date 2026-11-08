# Ringbeat

Euclidean polyrhythms on a dial. Spread pulses evenly around rings of different sizes, watch them drift in and out of phase, share the pattern as a link, and download it as MIDI or a seamless WAV loop.

It runs entirely in your browser. There are no accounts, no server and no tracking, and a pattern lives in the link you share.

## What is a Euclidean rhythm?

Take `k` pulses and `n` steps and spread the pulses as evenly as possible. Bjorklund's algorithm does exactly that, and G. Toussaint showed in 2005 that many traditional rhythms fall out of it. For example, 3 pulses in 8 steps gives `x..x..x.`, the tresillo, and 5 in 8 gives `x.xx.xx.`, the cinquillo.

In Ringbeat every ring takes exactly one bar to go round, whatever its step count. A ring with 3 steps and a ring with 4 steps therefore play three against four, and rings of 5, 7 and 11 only line up on the downbeat.

## Quick start

You need Node 20.19 or newer.

```bash
npm ci
npm run dev
```

Open the address Vite prints. Press the button in the middle of the dial, or press Space.

## Using it

- **Pulses, Steps, Rotate** shape each ring. Rotate shifts the finished pattern to the right.
- **Swing** delays every second step. 0 is straight and about 66 gives a triplet feel.
- **Start from** loads a preset: four patterns named in Toussaint's paper and two polyrhythms.
- **Copy link** copies a URL that holds the whole pattern. The address bar always shows the current link.
- **Download MIDI** writes four bars as a format 1 file, one track per audible ring, on the General MIDI percussion channel.
- **Download WAV** renders four bars to a 16-bit mono file that loops without a click.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built app |
| `npm run typecheck` | TypeScript check with no emit |
| `npm test` | Run the unit tests once with Vitest |
| `npm run e2e` | Browser check in Chromium (build first; see below) |

The browser check needs Chromium for Playwright, installed once with `npx playwright install chromium`. It starts the preview server itself and checks audio scheduling against hand-typed rhythms, the controls, share links, both exports, themes, reduced motion and accessible names. Screenshots go to `e2e/output/`.

## How it is built

The rhythm logic is plain TypeScript with no browser APIs, so it is tested in Node. The browser layer is thin.

```
src/core/      pure logic: euclid, song model, scheduler, codec, MIDI, synth, WAV
src/audio/     lookahead scheduler and the Web Audio adapter
src/ui/        React components and the dial geometry
e2e/           end-to-end browser check
```

- **One synth, two outputs.** Each drum voice is a pure function that returns samples. The same buffers feed live playback and the WAV export, so what you hear is what you download.
- **Scheduling.** A timer wakes every 25 ms and hands the notes of the next 150 ms to the Web Audio clock with exact start times. The scheduler takes its clock and its "play a note" call as arguments, so it is tested without audio hardware.
- **Share links.** `#v1-` followed by base64url of a few bytes: tempo, swing, and six bytes per ring, closed by a CRC-8. Decoding validates every field and rejects damaged links instead of guessing.

## Limitations

See [ROADMAP.md](ROADMAP.md#known-limitations). In short: timing in hidden tabs is best-effort, and automated checks cover Chromium only.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The roadmap lists planned work with rough hour estimates.

## Credits

- Rhythm background: G. Toussaint, "The Euclidean Algorithm Generates Traditional Musical Rhythms" (2005).
- Typeface: [Jost](https://github.com/indestructible-type/Jost), SIL Open Font License 1.1, bundled through [Fontsource](https://fontsource.org/fonts/jost).

## License

Released under the [MIT License](LICENSE).
