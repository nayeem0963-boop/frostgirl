#!/usr/bin/env python3
"""Convert the project's source backgrounds into optimized WebP images."""

import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile

from PIL import Image, ImageOps, __version__ as pillow_version


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets-source" / "backgrounds"
DESTINATION = ROOT / "src" / "assets" / "backgrounds"
CACHE_DIR = ROOT / "scripts" / ".cache"  # build-tool cache: kept out of the folders that ship to the site
CACHE_NAME = "background-optimizer-cache.json"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
OUTPUT_NAMES = {
    "world 1 frozen kingdom": "world-01-frozen-kingdom.webp",
    "world 2 ice forest": "world-02-whispering-ice-forest.webp",
    "world 3 crystal mountain": "world-03-crystal-mountains.webp",
    "world 4 fozen ocean": "world-04-frozen-ocean.webp",
    "world 5 dream desert": "world-05-frosted-dream-desert.webp",
    "world 6 sky of aurora": "world-06-sky-of-aurora.webp",
    "world 7 celestial palace": "world-07-celestial-ice-palace.webp",
}
SETTINGS = {
    "max_size": [1080, 1920],
    "quality": 82,
    "lossless": False,
    "method": 6,
    "pillow_version": pillow_version,
    "version": 1,
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def output_name(source):
    return OUTPUT_NAMES.get(source.stem.casefold(), source.with_suffix(".webp").name)


def atomic_write(path, write):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
            temporary = Path(file.name)
            write(file)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def load_cache(path):
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as file:
        cache = json.load(file)
    if not isinstance(cache, dict):
        raise ValueError(f"Invalid cache format: {path}")
    return cache


def save_cache(path, cache):
    data = (json.dumps(cache, indent=2, sort_keys=True) + "\n").encode("utf-8")
    atomic_write(path, lambda file: file.write(data))


def report(name, original_size, original_bytes, output_size, output_bytes, status):
    saved = 100 * (original_bytes - output_bytes) / original_bytes
    print(
        f"{status}: {name}\n"
        f"  Original: {original_size[0]} x {original_size[1]}, {original_bytes:,} bytes\n"
        f"  Output:   {output_size[0]} x {output_size[1]}, {output_bytes:,} bytes\n"
        f"  Saved:    {saved:.2f}%"
    )


def main():
    if not SOURCE.is_dir():
        print(f"Error: source directory does not exist: {SOURCE}", file=sys.stderr)
        return 1
    source_path = SOURCE.resolve()
    destination_path = DESTINATION.resolve()
    if destination_path == source_path or source_path in destination_path.parents:
        print("Error: destination must not be inside the source directory.", file=sys.stderr)
        return 1

    try:
        DESTINATION.mkdir(parents=True, exist_ok=True)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path = CACHE_DIR / CACHE_NAME
        cache = load_cache(cache_path)
        sources = sorted(
            (path for path in SOURCE.iterdir() if path.is_file() and path.suffix.lower() in EXTENSIONS),
            key=lambda path: path.name.casefold(),
        )
        source_targets = {path.resolve() for path in sources}
    except (OSError, ValueError) as error:
        print(f"Error preparing optimizer: {error}", file=sys.stderr)
        return 1

    output_counts = {}
    for source in sources:
        key = output_name(source).casefold()
        output_counts[key] = output_counts.get(key, 0) + 1

    converted = []
    skipped = 0
    errors = 0
    total_original = 0
    total_output = 0
    for source in sources:
        output = DESTINATION / output_name(source)
        if output_counts[output.name.casefold()] > 1:
            print(f"Error: {source.name}: multiple sources map to {output.name}", file=sys.stderr)
            errors += 1
            continue
        try:
            if output.resolve() in source_targets:
                raise ValueError(f"output path resolves to a source image: {output}")
            source_data = source.read_bytes()
            source_hash = digest(source_data)
            with Image.open(io.BytesIO(source_data)) as image:
                original_size = image.size
                entry = cache.get(source.name)
                if (
                    isinstance(entry, dict)
                    and entry.get("source_sha256") == source_hash
                    and entry.get("settings") == SETTINGS
                    and output.is_file()
                    and entry.get("output_sha256") == digest(output.read_bytes())
                ):
                    with Image.open(output) as existing:
                        output_size = existing.size
                    report(source.name, original_size, len(source_data), output_size, output.stat().st_size, "Skipped")
                    skipped += 1
                    continue

                image = ImageOps.exif_transpose(image)
                transparent = "A" in image.getbands() or "transparency" in image.info
                image = image.convert("RGBA" if transparent else "RGB")
                image.thumbnail(tuple(SETTINGS["max_size"]), Image.Resampling.LANCZOS)
                output_size = image.size
                atomic_write(
                    output,
                    lambda file: image.save(file, format="WEBP", quality=82, lossless=False, method=6),
                )

            output_data = output.read_bytes()
            cache[source.name] = {
                "source_sha256": source_hash,
                "output_sha256": digest(output_data),
                "settings": SETTINGS,
            }
            save_cache(cache_path, cache)
            report(source.name, original_size, len(source_data), output_size, len(output_data), "Converted")
            converted.append(source.name)
            total_original += len(source_data)
            total_output += len(output_data)
        except Exception as error:
            print(f"Error converting {source.name}: {error}", file=sys.stderr)
            errors += 1

    saved_bytes = total_original - total_output
    saved_percent = 100 * saved_bytes / total_original if total_original else 0
    print(f"\nSummary: {len(converted)} converted, {skipped} skipped, {errors} errors.")
    if converted:
        print("Converted images: " + ", ".join(converted))
    print(f"Total storage saved for converted images: {saved_bytes:,} bytes ({saved_percent:.2f}%).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
