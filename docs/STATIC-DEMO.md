# Static evaluator demo

Build with Node.js 22 or newer, without installing packages:

```sh
node scripts/build-recorded.mjs
```

Publish **only `dist/`** as the website artifact. The build does not publish anything. It reads the checked-in production capture, normalizes it through the same server model, checks the browser schema and writes an explicit asset allowlist. It never reads a key or calls Panta.

The static page and its module imports work at a domain root or a GitHub Pages project subpath. `index.html` uses relative asset URLs. The generated app imports a recorded transport adapter, whose assets resolve against its own module directory. The live source app and Node server are unchanged.

The visible banner and replay button identify this as a recorded demo. Five genuinely captured market details are included. Every response retains its original capture date, request ID and Panta endpoint, with `mode: "recorded"`. Replaying cannot make it current. The original catalogue cursor is preserved; asking for the uncaptured next page gives `RECORDING_NOT_AVAILABLE`. No extra records or changed prices are invented.

`manifest.json` identifies the capture source hash, exact normalized-data paths, individual SHA-256 hashes and capture dates. The adapter validates the manifest and the frozen data schema, rejects non-recorded responses, checks the data hashes, allows only supported GET routes and never follows a provider URL. This detects mismatched or corrupted build assets; it is not an independent attestation of the provider's facts.

The public artifact excludes raw provider data, creator account fields, private configuration, tests, source documents and historical live exports. The source repository can contain the complete live implementation separately. Raw fixtures and screenshots should receive a separate release review before committing the source repository.

The build modifies only its checked output directory. It transforms copies of `public/index.html` and `public/app.mjs` using unique checked anchors, failing if those anchors change. Regenerate the build after every source or capture change. Do not hand-edit `dist/`.

Validation:

```sh
node --test test/static-recorded.test.mjs
npm test
```

Static-specific tests cover the allowlist, original source preservation, subpath requests, immutable recorded timestamps, separate zero/total volume values, forbidden methods and paths, uncaptured data, schema validation and integrity failures. A final hosted browser review remains necessary after deployment, including mobile display, checkpoint/replay, downloads and the uncaptured-page message. Local tests do not prove successful deployment or hackathon submission.

GitHub Pages workflow outline: check out the source; select Node 22; run `npm test`; run `node scripts/build-recorded.mjs`; upload `dist` with the Pages artifact action; deploy that artifact. Pages setup, workflow permissions, external publishing and receipt verification are handled outside this build script.
