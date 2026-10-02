# Sourcebrief — demo recording plan

**Status:** script only, prepared 2 October 2026. No completed video, voice recording or published video URL is implied. Target runtime **2 minutes 50 seconds**, hard production cap **3 minutes**. This is our conservative production target and follows the local acceptance plan; the saved Panta listing itself does not specify a video duration. Confirm the global CWF presentation requirements before recording.

## Mode selection and capture preparation

Choose **one** route for the main demonstration:

- **Live route:** use the currently authorized server-side Panta configuration. Verify that recorded mode is unset, the interface reports API capture rather than recorded response, and the response is not a test fixture. Preserve actual capture timestamps and any cache indication. A live request can return unchanged data.
- **Recorded route:** use the included `fixtures/panta-recording-2026-10-02.json`. Keep the visible recorded label and original 2 October timestamps. Narrate it as a replay of genuine saved API responses, not a current feed. Refresh replays the same observation.

Do not expose environment variables, terminal history, account pages or secret files. Start with an authentic application capture at native resolution. Use a source crop at least as large as its final displayed pixels, including any planned zoom; enlarge the actual UI or recapture if necessary. Keep title, relevant content and source label readable in the final exported video. The original screenshot or recording must not be replaced by generated UI text.

Before recording, confirm the sample market has enough real detail to read, save/export actions work, and the intended local checkpoint state is understood. Do not remove unrelated user data to stage the recording. An existing checkpoint may be explicitly replaced through the normal control if appropriate. Keep the same market ID throughout the checkpoint sequence.

## Timeline and English narration

| Time | Actual screen action | Narration |
|---|---|---|
| 0:00–0:15 | Show the product and the readable opening evidence sheet. | “A market headline is not the whole claim. Sourcebrief helps a researcher inspect what Panta actually reported, keep a checkpoint, and carry the evidence into the next review.” |
| 0:15–0:35 | Show catalogue, current mode and capture time; select one real record with missing catalogue title if available. Let detail supply the title. | **Live:** “This local prototype reads Panta's catalogue and detail API. The capture label and time tell us what we are looking at.” **Recorded alternative:** “This is a replay of genuine Panta API responses captured on October second. The recorded label and original capture time stay visible.” **Both:** “When a catalogue title is missing, Sourcebrief requests the detail instead of inventing one.” |
| 0:35–1:02 | Focus on resolution wording, provider identifiers and the dates. Allow enough pause to read an actual excerpt; do not paraphrase it into a different rule. | “The brief brings together resolution wording, provider-supplied source identifiers and UTC dates. These identifiers are not independently verified links. Missing information stays visible, and any shortened text is marked. The reviewer can inspect what is present before deciding what the market means.” |
| 1:02–1:22 | Show price source/status and distinct volume values. If the chosen record is resolved, use the second narration branch. | **Indicative record:** “These are indicative unit prices, with their provider source and status. We do not treat a raw field on another scale as the same value.” **Resolved record:** “This record reports resolved outcome values, with the provider's complete status. They are not current trading quotes.” **Both:** “Zero remains zero, and these two volume fields remain separate.” |
| 1:22–1:55 | Save checkpoint, reload the page, show retained checkpoint, then manually refresh. Keep actual resulting diff state. | “I save this capture in the browser and reload. The checkpoint remains attached to the same market. Refresh compares supported fields against it. A different request ID or capture timestamp is not a market change. Here, [say the actual result: ‘the tracked fields are unchanged’ OR briefly name the visible changed field].” |
| 1:55–2:10 | Optional short cut to the existing frontend test result, clearly captioned “Controlled synthetic test — not a live market event”. Otherwise remain on the actual comparison. | **With executed test evidence:** “A controlled test verifies the other case: changing resolution text produces explicit before and after values. Equivalent decimal formatting does not create a false change.” **Without test footage:** “When supported fields differ, the comparison keeps before and after values. I am not claiming that a market changed during this recording.” |
| 2:10–2:35 | Export Markdown and JSON through normal UI; open a real exported Markdown file and highlight its original capture time, mode, source/status and checkpoint section. Do not claim contents unseen. | “The output is a portable evidence brief, not just a screenshot. Markdown supports human review; JSON retains structured data. The original capture and checkpoint provenance travel with the export, so a later reader can distinguish the provider observation from this export time.” |
| 2:35–2:50 | Return to clean product view with attribution and relevant mode label. | “Sourcebrief is an independently implemented, Codex-assisted local prototype. Its contribution is the review workflow from Panta data to a comparable, exportable record. It does not verify the underlying claims or execute trades. User adoption and public deployment are still to be validated.” |

The bracketed result instruction is not spoken verbatim. Record the actual observed result. Never insert a fabricated price movement or changed rule to make the live scene more dramatic. If a failure occurs, either show the retained original evidence with the real error or rerecord a successful authorized run; do not silently label a recording as live.

## What each proof can and cannot establish

- Catalogue/detail footage proves the displayed app journey in the selected mode. The recorded route demonstrates application behaviour on saved real responses, not present-day service availability.
- Save/reload proves persistence in that browser/origin under that storage condition. It does not establish server history, immutable evidence or synchronization across devices.
- Controlled tests prove those tested behaviours for the release version. They are not external market events, user traction or an accuracy benchmark.
- Export footage must show the actual resulting file. Clicking a button alone does not prove a usable handoff.
- This demonstration does not stand in for Colosseum registration, eligibility or either submission receipt.

## Final recording checks

1. Record the exact application version, mode, test result used and source-capture date alongside the video artefact. If code changes materially, reconcile the demo.
2. Use actual browser footage and retained PNG originals. Check the final rendered file at output size and at a realistic smaller viewing size; recapture any unreadable interface crop.
3. Keep source mode and original capture information legible at the moment their evidence is used. Do not overlay a “live” badge on cached or recorded evidence.
4. Record or select a voice only under the user's existing voice/provider and spending permissions. This script grants no additional permission to buy, clone a voice or publish.
5. Time the final cut, not the text estimate. Remove optional test footage before rushing or hiding the central save/refresh/export journey. Retain a clear, honest ending.
6. Verify any final video link with evaluator access only after publication is authorized and completed. Until then, presentation link remains pending.
