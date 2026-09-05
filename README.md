# Lucci's Photo Select 0.2

A local macOS/Windows photo-culling desktop app. Coral, pink and purple branding with persistent light/dark appearance. No editing adjustments are provided.

## Workflow

1. **Select files** from a card, drive or computer. JPEG and RAW files with the same stem are paired only within their own directory. Identical image contents are skipped. RAW-only shoots get camera previews, with a RAW decode fallback when no embedded preview exists.
2. Review the quality-ranked grid. Shift-click selects a range; Command/Ctrl-click toggles individual photos. Use the bulk bar to rate, flag or bookmark the selection.
3. **Group bursts** displays one representative per group. Groups use capture times within three seconds and visual similarity. Click the frame-count badge to select the group. Photos without capture timestamps remain separate.
4. **Select best N** suggests up to the requested number, excluding rejects. The variety slider penalizes repeated bursts and similar compositions. Preview the suggestion, review the selected frames, then press Pick. It does not mark picks without your action.
5. Select two photos and click **Compare two**. Full RAW sensor data is demosaiced locally with LibRaw where supported. Fit / 100% applies to both panes; pan each separately. At 100%, one image pixel corresponds to one display pixel, including Retina screens. Decode failures are explicitly labeled and fall back to an available preview.
6. **Save portable LPV** writes a `.LPV` catalog and a companion `.LPV.assets-…` folder containing originals and previews. Move both together when changing computers. Existing companion folders are retained on repeat saves so prior project copies stay recoverable. Do not delete an asset folder used by a project you still need.
7. **Locate missing files** searches a chosen folder recursively. Original hashes are used when available; ambiguous matches are reported. Reanalyze ratings to rebuild image measurements while retaining manually assigned stars.
8. **Export** copies picks and bookmarks, excluding rejects. Existing filenames are either skipped or the incoming pair is renamed together. Original files are never overwritten. Export checks hashes and reports missing pairs and failures. Cancelling preserves completed exports; the current incomplete pair is removed.

Closing a library keeps its managed cache and any saved projects. Cancelled imports discard their staging copy and retain the previous library. This avoids losing unsaved work through a replacement import.

## Ratings

Scores are estimates, not guarantees. Focus uses detected eye regions when a reliable face is present, otherwise the central image region. Noise is estimated in low-gradient areas; highlight/shadow clipping informs exposure. Face crop safety reports detected faces touching image edges. Aesthetic framing still requires visual judgment and is labeled **Review** when there is no reliable face detection. This model does not identify people or guarantee closed-eye detection.

The face model and RAW decoder are bundled and run offline. RAW support depends on the bundled LibRaw version and camera/compression mode. Legacy catalogs retain older ratings until **Reanalyze ratings** is run.

## Shortcuts

Left/Right: navigate. Enter: inspect. C: compare two selected photos. P: pick. X: reject. U: clear flag. B: toggle bookmark. 0–5: rate. Command/Ctrl+A: select visible photos. Command/Ctrl+Z: undo. Shift+Command/Ctrl+Z: redo. Escape: close inspection/dialogs.

Undo/redo covers ratings, flags, notes and bookmarks, including bulk changes, for the current session. It does not undo exports or imports.

## Development and builds

Node.js 22+ and pnpm 11.19.0:

```sh
pnpm install
pnpm build
pnpm test
pnpm exec electron .
pnpm dist:mac
```

On Windows use `pnpm dist:win`. Installers go to `release/`. Signing certificates are not included. The GitHub Actions workflow builds on native macOS and Windows runners; publishing is disabled. Run the workflow manually after pushing the repository if you need Windows artifacts.

`tests/workflows.cjs` covers portable save/reopen after cache deletion, export conflicts, cancellation, duplicates, undo/redo and diversity selection. `scripts/real-photo-check.cjs` can validate RAW-only import and full decode against a local shoot. Development GUI tests can set `LPV_TEST_DATA` to an isolated application-data directory.

See `THIRD_PARTY_NOTICES.md` for bundled imaging libraries.
