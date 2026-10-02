# Sourcebrief video production

Local-only assets and renderer, prepared 2 October 2026. No external publishing, browser capture, credentials, paid service or installation is performed by this pipeline. The current storyboard is **recorded-mode only**: genuine Panta data captured on 2 October. If different evidence is supplied, reconcile narration and mode before rendering. Never disguise live/recorded/cached modes.

## Inputs for the capture operator

Final output is 1920×1080 at 30 fps. The image stage is at most **1808×740** pixels. The renderer permits native pixels or downscaling only; it never enlarges the screenshot or a crop. To make small UI text readable, capture with a larger real UI/text size, or capture a high-density source and provide a suitable detail crop. More source pixels alone do not make an entire long page legible.

Save fresh native JPEGs from CUA to `captures/`, or PNG originals where a capture tool actually provides PNG. Do not rename JPEG files to claim lossless sources; preserve native originals. Do not use screenshots from older videos or generated replacements. Source images should have at least 1808 useful pixels of width for full-stage coverage. A narrower image may be displayed at native size, but must pass manual legibility review. The renderer records format, source/crop dimensions and scaling. Converting a native JPEG into a PNG composition avoids another JPEG intermediate but cannot recover missing detail.

| File | Exact evidence needed |
|---|---|
| `01-overview.jpg` | Catalogue plus one populated detail, with original capture time and recorded mode. Show the detail title recovered for a catalogue row where applicable. |
| `02-rule.jpg` | Same market's resolution wording, provider source identifiers and dates. Use a detail-region crop if necessary for readable text. |
| `03-values.jpg` | Price source and valuation status, normalized values, distinct reported/total volume. Must match the narration; no implied likelihood or investment advice. |
| `04-checkpoint-saved.jpg` | Actual successful save state, checkpoint date and matching market ID. |
| `05-checkpoint-reloaded.jpg` | Actual state after reloading the same origin and market, showing retained checkpoint. |
| `06-refresh.jpg` | Actual refresh result for the same recorded observation: unchanged tracked fields, original capture time preserved. If different evidence is used, rewrite narration before rendering. |
| `07-export.jpg` | An actual exported Markdown file opened readably, including mode, original capture time and checkpoint section. A button screenshot alone is insufficient. |
| `08-resolved.jpg` | The actual captured resolved record, with `resolved_outcome`, provider complete status and zero/one values labelled as outcome values. |

No fake cursor or click animation is added. The video labels its format **Actual browser captures · selected states**; it does not claim uninterrupted footage. The crop must retain enough context to identify the evidence; do not crop away a warning or contradicted result.

## Preparing narration and previews

Installed tools already found: Python 3.14, Pillow 12.2, `imageio_ffmpeg`'s FFmpeg 7.1, Windows System.Speech with Microsoft Zira Desktop. The user previously authorized a free local voice. This pipeline uses that local fallback and makes no ElevenLabs request; it does not claim a fresh ElevenLabs quota check.

```powershell
python submission/video/render.py --prepare
```

This produces local narration, timing metadata, English SRT and title/end previews. It calculates the actual duration from synthesized PCM. A duration above 180 seconds fails rather than accelerating the evidence. Narration has no cloned voice or music.

For each captured image, an optional `crop` key in its storyboard scene is `[left, top, right, bottom]` in **original pixels**. The renderer validates that the rectangle is inside the source. Do not set it using coordinates from a resized chat thumbnail. Use `--posters` for exact final-size frames and inspect those before encoding.

```powershell
python submission/video/render.py --posters
python submission/video/render.py --render --assets-reviewed
```

`--assets-reviewed` is an internal operator assertion that every original is genuine, current, correctly labelled, free of secrets and readable at its rendered size. It is not a request for another user approval. Final output: `sourcebrief-demo.mp4`. The receipt records hashes, input dimensions, scale, exact timeline, voice and local tool version. No URL or receipt of external submission is generated.

## Acceptance before handing off

- Inspect `posters/contact-sheet.jpg` and each original-size 1920×1080 poster. A contact sheet is only an overview, never a substitute for text legibility review.
- Inspect representative frames decoded from the final MP4 at native output size, especially the rule, checkpoint, refresh and export. Check the video and voice together. Caption length, timing and media decoding are checked by the renderer; factual and visual QA remain manual.
- Confirm mode and chronology match the actual capture operation. The exports must be the files that were really generated.
- The ending asks the reviewer to inspect evidence; it invents no public URL, user traction or organizer approval. Add a verified final URL only if it exists and the release record requires one.
- Retain native source images and render receipt. The pipeline keeps only lightweight scene segments, not thousands of full-frame PNGs. Delete intermediates only after the final file has been reviewed and under the existing cleanup scope.
