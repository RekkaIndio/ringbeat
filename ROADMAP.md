# Roadmap

Where Ringbeat is and where it is going. Open work is tracked in [GitHub Issues](../../issues); this file is the high-level view. Hour estimates are rough.

## Shipped

- [x] Euclidean rhythm generator (Bjorklund) with rotation, checked against published patterns and for even spacing across every pulse and step count
- [x] Polyrhythm model: every ring takes one bar, so rings with different step counts drift against each other
- [x] Swing, tempo from 40 to 240 bpm, up to six rings, eight built-in drum voices
- [x] Lookahead scheduler on the Web Audio clock; edits apply while playing
- [x] Dial interface with playhead, hit pops, keyboard play/stop and a floating button on phones
- [x] Share a pattern as a link, with a versioned, checksummed codec and plain-language errors
- [x] Export to MIDI (format 1, General MIDI percussion) and to a seamless WAV loop
- [x] Light and dark themes, reduced-motion support
- [x] Unit tests for all pure logic and an end-to-end browser check

## Next

- [ ] **Keep time in background tabs** with a Worker-driven timer, so a hidden tab never stutters (3 hours)
- [ ] **Edit individual steps** by tapping them, as an override on top of the Euclidean pattern; needs share-link version 2 (5 hours)
- [ ] **Per-ring speed** (half, double, triple) for phrases longer or shorter than one bar (4 hours)
- [ ] **Pan and tone** per ring: stereo position and a decay control (3 hours)
- [ ] **Export options**: number of bars, sample rate, stereo, and a tail (3 hours)
- [ ] **MIDI options**: choose the drum map and note lengths (2 hours)
- [ ] **Tap tempo** and keyboard shortcuts for tempo (2 hours)
- [ ] **Installable offline app** with a service worker and manifest (3 hours)
- [ ] **Local pattern library** saved in the browser, never uploaded (3 hours)
- [ ] **Rotate by dragging** a ring on the dial (4 hours)
- [ ] **Component tests** for the controls with Testing Library (3 hours)
- [ ] **Run the end-to-end check in CI** (2 hours)
- [ ] **Accessibility pass** with a screen reader, plus a text view of each ring's pattern (4 hours)
- [ ] **Load your own samples** from local files, never uploaded (5 hours)
- [ ] **Web MIDI output** to drive hardware drum machines and synths (5 hours)
- [ ] **Explainer page** that animates Bjorklund's algorithm step by step (4 hours)

## Later

- [ ] Export the dial as an SVG or PNG poster
- [ ] Other generators next to Euclid: rhythm necklaces, Lindenmayer rhythms
- [ ] Probability and humanise controls
- [ ] Native iOS and Android builds with Capacitor

## Known limitations

- Timing in a hidden tab relies on a longer lookahead, because browsers slow timers there. Edits made while the tab is hidden take effect late, and after several minutes hidden, browsers may throttle further. The Worker timer above fixes this.
- Changing swing while playing can move a note that is already queued by up to one slice (a sixteenth note).
- Tested in Chromium. Safari, Firefox and real phones are not yet covered by automated checks.
