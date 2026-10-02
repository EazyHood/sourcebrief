# Static evaluator demo

The source repository is published at [github.com/EazyHood/sourcebrief](https://github.com/EazyHood/sourcebrief), first from commit `cb36790`. The tested release is `1616f17`; [Pages run 37015736379](https://github.com/EazyHood/sourcebrief/actions/runs/37015736379) succeeded on 2 October 2026. The public [demo](https://eazyhood.github.io/sourcebrief/) and [presentation player](https://eazyhood.github.io/sourcebrief/presentation.html) were verified in the browser. This publication is separate from the still-unsubmitted official hackathon entries.

Build with Node.js 22 or newer, without installing packages:

```sh
node scripts/build-recorded.mjs
```

Publish **only `dist/`** as the website artifact. The build does not publish anything. It reads the checked-in production capture, normalizes it through the same server model, checks the browser schema and writes an explicit asset allowlist. It never reads a key or calls Panta.

The static page and its module imports work at a domain root or a GitHub Pages project subpath. `index.html` uses relative asset URLs. The generated app imports a recorded transport adapter, whose assets resolve against its own module directory. The live source app and Node server are unchanged.

The visible banner and replay button identify this as a recorded demo. Five genuinely captured market details are included. Every response retains its original capture date, request ID and Panta endpoint, with `mode: "recorded"`. Replaying cannot make it current. The original catalogue cursor is preserved; asking for the uncaptured next page gives `RECORDING_NOT_AVAILABLE`. No extra records or changed prices are invented.

`manifest.json` identifies the capture source hash, exact normalized-data paths, individual SHA-256 hashes and capture dates. The adapter validates the manifest and the frozen data schema, rejects non-recorded responses, checks the data hashes, allows only supported GET routes and never follows a provider URL. This detects mismatched or corrupted build assets; it is not an independent attestation of the provider's facts.

The public artifact excludes raw provider data, creator account fields, private configuration, tests, source documents and historical live exports. The source repository contains the complete local live implementation separately. Its public fixture was minimized only after the full original was preserved outside the repository; the normalized evidence stayed byte-identical. The projection and screenshots received a separate release review. See `PROVENANCE.md` and `QA-2026-10-02.md`.

The build also copies an allowlisted presentation page, stylesheet, poster, English WebVTT captions and `media/sourcebrief-demo.mp4`. The MP4 is approximately 2 minutes 34 seconds, 1920×1080 at 30 fps, with authorized local synthetic English narration. It uses actual browser captures of selected recorded states, not continuous live footage. These media are separate from the manifest's normalized-data hashes; the render receipt records the video hash. The app's Larger text control remains available in the static version.

The build modifies only its checked output directory. It transforms copies of `public/index.html` and `public/app.mjs` using unique checked anchors, failing if those anchors change. Regenerate the build after every source or capture change. Do not hand-edit `dist/`.

Validation:

```sh
node --test test/static-recorded.test.mjs
npm test
```

Static-specific tests cover the allowlist, original source preservation, subpath requests, immutable recorded timestamps, separate zero/total volume values, forbidden methods and paths, uncaptured data, schema validation and integrity failures. The last full suite passed 50 tests; static-specific tests also passed after media packaging. Hosted review confirmed the five recorded markets, checkpoint/reload/replay, an actual validated JSON download, normal/Larger text mobile layout, the uncaptured-page error and playing/seeking/pausing the video. No listening audit or optional WebVTT selection check was performed. See `QA-2026-10-02.md` for exact scope and evidence. Repeat relevant hosted checks after material changes; neither deployment nor tests prove hackathon submission.

GitHub Pages workflow outline: check out the source; select Node 22; run `npm test`; run `node scripts/build-recorded.mjs`; upload `dist` with the Pages artifact action; deploy that artifact. Pages setup, workflow permissions, external publishing and receipt verification are handled outside this build script.
