# Lucci's Photo Select 0.2

A local macOS/Windows photo-culling desktop app. Coral, pink and purple branding with persistent light/dark appearance. No editing adjustments are provided.

## Workflow

1. **Select files** from a card, drive or computer. JPEG and RAW files with the same stem are paired only within their own directory. Identical image contents are skipped. RAW-only shoots get camera previews, with a RAW decode fallback when no embedded preview exists.
2. Review the quality-ranked grid. Shift-click selects a range; Command/Ctrl-click toggles individual photos. Use the bulk bar to rate, flag or bookmark the selection.
3. **Group bursts** displays one representative per group. Groups use capture times within three seconds and visual similarity. Click the frame-count badge to select the group. Photos without capture timestamps remain separate.
4. **Select best N** suggests up to the requested number, excluding rejects. The variety slider penalizes repeated bursts and similar compositions. Preview the suggestion, review the selected frames, then press Pick. It does not mark picks without your action.
5. Select two photos and click **Compare two**. Full RAW sensor data is demosaiced locally with LibRaw where supported. Fit / 100% applies to both panes; pan each separately. At 100%, one image pixel corresponds to one display pixel, including Retina screens. Decode failures are explicitly labeled and fall back to an available preview.
6. **File → Save LPV** writes a version 3 catalog with original file locations, ratings, flags, labels, notes, and viewing-profile choices. It does not copy photographs or create an assets folder. Imports reference originals too. Keep source drives available; if files move, use **Locate missing files**. Older portable LPV projects still open; their existing assets are left in place. Previews are regenerated in the app cache when needed.
7. **Locate missing files** searches a chosen folder recursively. Original hashes are used when available; ambiguous matches are reported. Reanalyze ratings to rebuild image measurements while retaining manually assigned stars.
8. **Export** copies picks and bookmarks, excluding rejects. Existing filenames are either skipped or the incoming pair is renamed together. Original files are never overwritten. Export checks hashes and reports missing pairs and failures. Cancelling preserves completed exports; the current incomplete pair is removed.

Closing a library keeps its managed cache and any saved projects. Cancelled imports discard their staging copy and retain the previous library. This avoids losing unsaved work through a replacement import.

## Ratings

Technical scores are separate from your stars. New imports start unrated. Focus is measured on a lightly smoothed image to reduce sensitivity to noise, using the weakest detected eye region when available. Exposure cannot compensate for weak focus; images without reliable eye evidence are capped at 3/5 and marked for review. This is a conservative heuristic, not a model that understands the intended subject or aesthetic quality. Reanalysis preserves existing stars, including stars assigned by older app versions; set those to zero if you want to start your own ratings afresh.

## Preview and camera profiles

File menus provide open, save, import, and export in both grid and preview views. View menus contain Fit and 100%; wheel zoom and drag panning remain available. Ratings/photo information and both bottom filmstrips collapse by clicking their headings. Filters combine flags/review status with minimum stars, RAW/JPEG format, camera, color label, dates, and text.

Neutral RAW applies the recorded active image area before orientation, avoiding padded Sony RAW tile borders. Camera as shot shows the camera JPEG preview. Camera-specific DCP rendering requires a local RawTherapee installation: select `rawtherapee-cli.exe` using **Set RawTherapee renderer**, then add your `.dcp` files. Only profiles identifying the selected camera appear. Profiles are referenced locally and are not bundled or redistributed. Full DCP processing is delegated to RawTherapee (tone curve, hue/saturation map, look table, and exposure offset enabled); results are not guaranteed identical to Lightroom.

The [Sony A7V profile generator](https://github.com/davrukin/Sony-A7V-Picture-Profile-Creator) produces community-derived A7V profiles from locally installed Adobe donor profiles. Its source files must be available before generating ST/PT profiles; the repository itself does not supply them. Profile rendering needs verification with your actual profiles and renderer.

The face model and RAW decoder are bundled and run offline. RAW support depends on the bundled LibRaw version and camera/compression mode. Legacy catalogs retain older ratings until **Reanalyze ratings** is run.

## Shortcuts

Left/Right: navigate. Enter/F3: preview. C: compare two selected photos. P: pick. X: reject. U: clear flag. B: bookmark. R: review marker. 0–5: your stars. Z: fit/100% in preview. Command/Ctrl+A: select visible photos. Command/Ctrl+Z: undo. Shift+Command/Ctrl+Z: redo. Command/Ctrl+O/S/E: open/save/export. Escape: close dialogs or preview. Shortcuts pause while typing notes or editing filter fields. Key hints appear beside the corresponding controls.

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

`tests/workflows.cjs` covers reference save/reopen, preview regeneration, missing-file recovery, exports, cancellation, duplicates, undo/redo and selection. `tests/quality.cjs` checks scoring limits; `tests/profiles.cjs` checks DCP metadata and renderer configuration. Run `pnpm exec electron tests/viewer/run.cjs` after building for hidden viewer interaction tests. `node tests/viewer/raw-check.cjs path/to/photo.ARW` checks a real RAW's active dimensions and creates a temporary preview for inspection. Development GUI tests can set `LPV_TEST_DATA` to an isolated application-data directory.

See `THIRD_PARTY_NOTICES.md` for bundled imaging libraries.
