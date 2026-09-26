"""Prepare the local India satellite-derived basemap used by the AOI Explorer.

Source: NASA Blue Marble Next Generation true-color global mosaic, MODIS/Terra.
Retrieval: development-time only; this script is not used by the application.
Extent: west 50, south 6, east 115, north 37.5.

The script uses only Python's standard library plus macOS/Linux image tools when
available. ImageMagick (`magick`) or macOS `sips` is used for crop/resampling.
"""

from __future__ import annotations

import shutil
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

SOURCE_URL = (
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74218/"
    "world.200412.3x5400x2700.jpg"
)
OUTPUT = Path(__file__).resolve().parents[1] / "frontend/public/assets/india-satellite.png"
# Global image dimensions for the NASA 3x5400x2700 product.
WEST, SOUTH, EAST, NORTH = 50.0, 6.0, 115.0, 37.5
GLOBAL_WIDTH, GLOBAL_HEIGHT = 5400, 2700
TARGET_WIDTH, TARGET_HEIGHT = 2200, 1100


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="geospectra-basemap-") as temp_dir:
        temp = Path(temp_dir)
        source = temp / "world.jpg"
        cropped = temp / "india.jpg"
        _download(source)
        left = round((WEST + 180) / 360 * GLOBAL_WIDTH)
        right = round((EAST + 180) / 360 * GLOBAL_WIDTH)
        top = round((90 - NORTH) / 180 * GLOBAL_HEIGHT)
        bottom = round((90 - SOUTH) / 180 * GLOBAL_HEIGHT)
        crop_geometry = f"{right - left}x{bottom - top}+{left}+{top}"
        if shutil.which("magick"):
            subprocess.run(
                ["magick", str(source), "-crop", crop_geometry, "+repage", "-resize",
                 f"{TARGET_WIDTH}x{TARGET_HEIGHT}", str(OUTPUT)],
                check=True,
            )
        elif shutil.which("sips"):
            subprocess.run(["sips", "-c", str(bottom - top), str(right - left), "--cropOffset", str(top), str(left), str(source), "--out", str(cropped)], check=True)
            subprocess.run(["sips", "-z", str(TARGET_HEIGHT), str(TARGET_WIDTH), "-s", "format", "png", str(cropped), "--out", str(OUTPUT)], check=True)
        else:
            raise RuntimeError("Install ImageMagick or run on macOS with sips available to crop the NASA image.")
    print(f"Wrote {OUTPUT} from {SOURCE_URL}")


def _download(destination: Path) -> None:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "GeoSpectra development asset preparation"})
    try:
        response = urllib.request.urlopen(request, timeout=60)
    except (ssl.SSLCertVerificationError, urllib.error.URLError) as error:
        if not isinstance(getattr(error, "reason", error), ssl.SSLCertVerificationError) and not isinstance(error, ssl.SSLCertVerificationError):
            raise
        # Some developer machines lack the NASA certificate chain in Python's store.
        response = urllib.request.urlopen(request, context=ssl._create_unverified_context(), timeout=60)
    with response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


if __name__ == "__main__":
    main()
