# Lucci's Photo Select

A local, cross-platform desktop culling app for RAW and JPEG photo shoots. Select files from an SD card, external drive, or anywhere on the computer. Lucci's Photo Select imports them into a managed local cache, assigns a 1–5 star rating, and keeps each original attached for export.

## Features

- Managed local import cache for faster browsing and reliable previews between launches
- Paired ARW, CR2, CR3, NEF, RAF, ORF, RW2, DNG + JPEG handling
- RAW-only support using the camera's embedded high-resolution JPEG preview
- Automatic ratings based on focus, exposure/clipping, noise, and framing weighting
- Lightroom-inspired dark library grid and detail inspector
- Manual star overrides, bookmarks, searchable notes, sorting and filtering
- Pick/reject flags, keyboard shortcuts, adjustable grid size, and a large loupe view
- Save and reopen grid catalogs as `.LPV` files
- Exports both the JPEG and matching RAW for every bookmarked photo
- Native macOS and Windows packaging from one codebase

## Development

Install Node.js 22 or newer, then:

```bash
pnpm install
pnpm dev
```

## Build installers

Build macOS packages on a Mac:

```bash
pnpm dist:mac
```

Build Windows packages on Windows:

```powershell
pnpm dist:win
```

Installers are written to `release/`. Windows packages should be built on Windows (or in a Windows CI runner), especially when code-signing is enabled. Unsigned builds may show operating-system security warnings.

The included GitHub Actions workflow can build both platforms automatically. Push the project to GitHub, open **Actions → Build PhotoApp installers**, choose **Run workflow**, and download the Mac and Windows artifacts when it finishes.

## Workflow

1. Click **Select files** and choose RAW files, JPEG files, or both.
2. Files can come from an SD card, external drive, or the computer.
3. Wait while files copy to the computer and are ranked.
4. Review the ranked grid, adjust stars, bookmark selects, and add notes.
5. Click **Export** and choose your job's `01 RAW` folder.

Lucci's Photo Select never modifies source photos. Its catalog and managed working cache live in the operating system's application-data directory. Clearing the library removes that managed cache but never touches the originals.
