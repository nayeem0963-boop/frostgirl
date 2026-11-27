# Background image optimizer

Install Python 3 and Pillow:

```sh
python -m pip install Pillow
```

From the project root, run:

```sh
python scripts/optimize-backgrounds.py
```

The script scans `assets-source/backgrounds/` (not subdirectories) for PNG,
JPG, JPEG, and WebP files and writes WebP files to
`src/assets/backgrounds/` (Vite content-hashes them at build time; see `src/assets/manifest.js`). The seven existing source base names map
to the following standardized filenames (regardless of input extension):

| Source base name | Output filename |
| --- | --- |
| `world 1 frozen kingdom` | `world-01-frozen-kingdom.webp` |
| `world 2 ice forest` | `world-02-whispering-ice-forest.webp` |
| `world 3 crystal mountain` | `world-03-crystal-mountains.webp` |
| `world 4 fozen ocean` | `world-04-frozen-ocean.webp` |
| `world 5 dream desert` | `world-05-frosted-dream-desert.webp` |
| `world 6 sky of aurora` | `world-06-sky-of-aurora.webp` |
| `world 7 celestial palace` | `world-07-celestial-ice-palace.webp` |

Other sources keep their base names. The script creates the destination if
needed and never changes the source files. Existing destination files with
matching names may be replaced. If multiple sources would produce the same
destination name, those files are reported as errors and left unconverted.

Images are oriented according to their EXIF orientation, resized only if needed
to fit within 1080 x 1920 pixels, and encoded at quality 82 with transparency
preserved. For animated images, only the first frame is converted.

The destination's `.background-optimizer-cache.json` records source and output
hashes and the encoder settings. Unchanged images with intact outputs are
skipped; changed images, outputs, settings, or Pillow versions are converted
again. Removing the cache forces a fresh conversion. The report lists each
image's dimensions and sizes and summarizes the savings for images converted in
that run. Errors are reported individually, processing continues, and the script
exits with a nonzero status if any image fails.
