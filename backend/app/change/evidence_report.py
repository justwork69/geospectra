"""Offline analyst evidence report payload and Pillow PDF rendering."""
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont, ImageOps


PAGE_SIZE = (595, 842)
MARGIN = 36
BG = "#f5f7fa"
DARK = "#14283b"
BLUE = "#174d63"
MUTED = "#586776"
RULE = "#d8e0e8"
PANEL = "#edf2f7"
GENERATED_DIR = (Path(__file__).resolve().parents[3] / "data" / "generated").resolve()


def _resolve_generated_asset(value: str | Path | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.startswith(("http://", "https://")):
        request_path = urlparse(text).path
        if not request_path.startswith("/generated/"):
            return None
        text = request_path
    if text.startswith("/generated/"):
        relative = text.removeprefix("/generated/")
    elif text.startswith("generated/"):
        relative = text.removeprefix("generated/")
    elif text.startswith("/"):
        candidate = Path(text).resolve()
        try:
            candidate.relative_to(GENERATED_DIR)
        except ValueError:
            return None
        return str(candidate) if candidate.exists() and candidate.is_file() else None
    else:
        relative = text
    clean_relative = relative.replace("\\", "/")
    if clean_relative.startswith("../") or clean_relative.startswith("/"):
        return None
    resolved = (GENERATED_DIR / clean_relative).resolve()
    try:
        resolved.relative_to(GENERATED_DIR)
    except ValueError:
        return None
    return str(resolved) if resolved.exists() and resolved.is_file() else None


def _metric(value):
    return value if value is not None else None


def build_report_payload(tile_id: str, facts: dict, analysis_rows: dict, summary: str | None) -> dict:
    before = analysis_rows.get("before") or {}
    after = analysis_rows.get("after") or {}
    sar_available = facts.get("sar_available") is True
    sar_note = (
        "SAR evidence is available for the selected interval."
        if sar_available
        else "Sentinel-1/SAR evidence is unavailable for the selected interval; the assessment relies on the available optical temporal evidence."
    )
    image_status = {
        "before": bool(before.get("image_path") or before.get("image_url")),
        "after": bool(after.get("image_path") or after.get("image_url")),
        "difference_heatmap": bool(analysis_rows.get("difference_heatmap_path") or analysis_rows.get("difference_heatmap_url")),
    }
    return {
        "report_type": "analyst_evidence_report",
        "report_version": "geospectra-evidence-report-v2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tile_id": tile_id,
        "aoi_id": facts.get("aoi_id"),
        "interval": {
            "from": facts.get("from_date"),
            "to": facts.get("to_date"),
            "days": facts.get("separation_days"),
        },
        "metrics": {
            key: _metric(facts.get(key))
            for key in (
                "change_score", "velocity", "acceleration", "trend", "ndvi_delta", "ndwi_delta",
                "sar_change", "sar_vv_delta", "sar_vh_delta", "observations_used", "modality",
            )
        },
        "indices": [
            {"name": "NDVI", "before": before.get("ndvi_mean"), "after": after.get("ndvi_mean"), "delta": facts.get("ndvi_delta")},
            {"name": "NDWI", "before": before.get("ndwi_mean"), "after": after.get("ndwi_mean"), "delta": facts.get("ndwi_delta")},
        ],
        "sar": {
            "available": sar_available,
            "change": facts.get("sar_change") if sar_available else None,
            "vv_delta": facts.get("sar_vv_delta") if sar_available else None,
            "vh_delta": facts.get("sar_vh_delta") if sar_available else None,
            "note": sar_note,
        },
        "analyst_summary": summary or "Grounded analyst summary unavailable.",
        "limitations": [
            "Optical and SAR indices are measurements of spectral response and do not by themselves establish a physical cause.",
            "This assessment is limited to the observations available for the selected interval.",
            "SAR conclusions are unavailable when valid SAR observations do not exist for the pairing.",
            "Seasonal and environmental variation can affect optical indices and should be reviewed alongside the underlying imagery.",
            "Analyst interpretation should be reviewed against the source imagery and contextual evidence before formal decision-making.",
            *([sar_note] if not sar_available else []),
        ],
        "image_status": image_status,
        "image_sources": {
            "before": before.get("image_path") or before.get("image_url"),
            "after": after.get("image_path") or after.get("image_url"),
            "difference_heatmap": analysis_rows.get("difference_heatmap_path") or analysis_rows.get("difference_heatmap_url"),
        },
        "image_urls": {
            "before": before.get("image_url"),
            "after": after.get("image_url"),
            "difference_heatmap": analysis_rows.get("difference_heatmap_url"),
        },
    }


def _font(size: int, bold: bool = False):
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _value(value, digits: int = 5) -> str:
    if value is None:
        return "UNAVAILABLE"
    if isinstance(value, float):
        return f"{value:.{digits}f}".rstrip("0").rstrip(".")
    return str(value)


def _safe_local_path(path: str | Path | None) -> str | None:
    if not path:
        return None
    source = Path(path)
    return str(source) if source.exists() else None


def _fit_image(path: str | Path | None, size: tuple[int, int], fallback_label: str = "SOURCE IMAGERY\nUNAVAILABLE") -> Image.Image:
    canvas = Image.new("RGB", size, PANEL)
    draw = ImageDraw.Draw(canvas)
    resolved = _resolve_generated_asset(path) or _safe_local_path(path)
    if resolved:
        try:
            with Image.open(resolved) as source:
                source.verify()
            with Image.open(resolved) as source:
                image = ImageOps.exif_transpose(source)
                if image.mode == "RGBA":
                    background = Image.new("RGBA", image.size, PANEL)
                    image = Image.alpha_composite(background, image).convert("RGB")
                else:
                    image = image.convert("RGB")
                image.thumbnail((size[0] - 18, size[1] - 18), Image.Resampling.LANCZOS)
                paste_x = max(0, (size[0] - image.width) // 2)
                paste_y = max(0, (size[1] - image.height) // 2)
                canvas.paste(image, (paste_x, paste_y))
                return canvas
        except (OSError, ValueError, TypeError):
            pass
    font = _font(18, True)
    box = draw.multiline_textbbox((0, 0), fallback_label, font=font, spacing=4, align="center")
    draw.multiline_text(((size[0] - box[2]) / 2, (size[1] - box[3]) / 2), fallback_label, fill="#526273", font=font, spacing=4, align="center")
    return canvas


def _draw_wrapped(draw, text: str, xy: tuple[int, int], width: int, font, fill: str, max_lines: int | None = None, line_gap: int = 5) -> int:
    words = str(text or "").split()
    if not words:
        return 0
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(".,;:") + "..."
    draw.multiline_text(xy, "\n".join(lines), font=font, fill=fill, spacing=line_gap)
    return len(lines) * (font.size + line_gap)


def _section_heading(draw, x: int, y: int, text: str, font):
    draw.text((x, y), text, font=font, fill=BLUE)
    draw.line((x, y + 18, x + 200, y + 18), fill=RULE, width=1)
    return y + 28


def _draw_metric_table(draw, x: int, y: int, rows: list[tuple[str, str]], font):
    header_font = _font(11, True)
    draw.text((x, y), "METRIC", font=header_font, fill=DARK)
    draw.text((x + 180, y), "VALUE", font=header_font, fill=DARK)
    y += 18
    for label, value in rows:
        draw.text((x, y), label, font=font, fill=DARK)
        draw.text((x + 180, y), value, font=font, fill=BLUE)
        y += 18
    return y


def render_report_pdf(payload: dict, before_path: str | None, after_path: str | None, heatmap_path: str | None) -> bytes:
    page1 = Image.new("RGB", PAGE_SIZE, BG)
    page2 = Image.new("RGB", PAGE_SIZE, BG)
    draw1 = ImageDraw.Draw(page1)
    draw2 = ImageDraw.Draw(page2)

    serif = _font(22, True)
    section = _font(14, True)
    body = _font(11)
    small = _font(9)
    bold = _font(11, True)
    title = _font(22, True)

    def draw_header(draw, page_number: int):
        draw.text((MARGIN, 24), "GEOSPECTRA", font=serif, fill=DARK)
        draw.text((MARGIN, 54), "ANALYST EVIDENCE REPORT", font=title, fill=BLUE)
        draw.text((MARGIN, 82), f"Tile {payload.get('tile_id', 'UNAVAILABLE')}  |  AOI {payload.get('aoi_id', 'UNAVAILABLE')}  |  {payload.get('interval', {}).get('from', 'UNAVAILABLE')} to {payload.get('interval', {}).get('to', 'UNAVAILABLE')}", font=small, fill=MUTED)
        draw.line((MARGIN, 102, 595 - MARGIN, 102), fill=RULE, width=1)
        draw.text((595 - MARGIN - 120, 26), f"P{page_number}", font=small, fill=MUTED)

    draw_header(draw1, 1)
    draw_header(draw2, 2)

    summary = payload.get("analyst_summary") or "Grounded analyst summary unavailable."
    summary_box_y = 116
    draw1.text((MARGIN, summary_box_y), "EXECUTIVE EVIDENCE SUMMARY", font=section, fill=BLUE)
    summary_height = _draw_wrapped(draw1, summary, (MARGIN, summary_box_y + 18), 595 - 2 * MARGIN, body, DARK, max_lines=5)
    summary_y = summary_box_y + 18 + summary_height + 8
    draw1.line((MARGIN, summary_y, 595 - MARGIN, summary_y), fill=RULE, width=1)

    panel_w = int((595 - MARGIN * 2 - 16) / 2)
    panel_h = 174
    before_x, after_x = MARGIN, MARGIN + panel_w + 16
    y = summary_y + 16

    draw1.text((before_x, y), "Figure 1 — Before imagery", font=small, fill=MUTED)
    draw1.text((after_x, y), "Figure 2 — After imagery", font=small, fill=MUTED)
    before_panel = _fit_image(before_path, (panel_w, panel_h), "SOURCE IMAGERY\nUNAVAILABLE")
    after_panel = _fit_image(after_path, (panel_w, panel_h), "SOURCE IMAGERY\nUNAVAILABLE")
    page1.paste(before_panel, (before_x, y + 12))
    page1.paste(after_panel, (after_x, y + 12))
    y += panel_h + 24

    draw1.text((MARGIN, y), "KEY METRICS", font=section, fill=BLUE)
    y += 18
    metric_rows = [
        ("Change score", _value(payload.get("metrics", {}).get("change_score"))),
        ("Velocity", _value(payload.get("metrics", {}).get("velocity"))),
        ("Acceleration", _value(payload.get("metrics", {}).get("acceleration"))),
        ("Trend", _value(payload.get("metrics", {}).get("trend"))),
        ("NDVI delta", _value(payload.get("metrics", {}).get("ndvi_delta"))),
        ("NDWI delta", _value(payload.get("metrics", {}).get("ndwi_delta"))),
        ("Observations used", _value(payload.get("metrics", {}).get("observations_used"))),
        ("Modality", _value(payload.get("metrics", {}).get("modality"))),
    ]
    _draw_metric_table(draw1, MARGIN, y, metric_rows, body)

    y2 = 116
    draw2.text((MARGIN, y2), "SPECTRAL EVIDENCE", font=section, fill=BLUE)
    y2 += 18
    spectral_rows = [
        ("NDVI", _value(payload.get("indices", [{}])[0].get("before")) if payload.get("indices") else "UNAVAILABLE", _value(payload.get("indices", [{}])[0].get("after")) if payload.get("indices") else "UNAVAILABLE", _value(payload.get("indices", [{}])[0].get("delta")) if payload.get("indices") else "UNAVAILABLE"),
        ("NDWI", _value(payload.get("indices", [{}])[1].get("before")) if len(payload.get("indices", [])) > 1 else "UNAVAILABLE", _value(payload.get("indices", [{}])[1].get("after")) if len(payload.get("indices", [])) > 1 else "UNAVAILABLE", _value(payload.get("indices", [{}])[1].get("delta")) if len(payload.get("indices", [])) > 1 else "UNAVAILABLE"),
    ]
    if payload.get("indices"):
        draw2.text((MARGIN, y2), "INDEX", font=bold, fill=DARK)
        draw2.text((MARGIN + 120, y2), "BEFORE", font=bold, fill=DARK)
        draw2.text((MARGIN + 220, y2), "AFTER", font=bold, fill=DARK)
        draw2.text((MARGIN + 320, y2), "DELTA", font=bold, fill=DARK)
        y2 += 18
        for name, before_value, after_value, delta_value in spectral_rows:
            draw2.text((MARGIN, y2), name, font=body, fill=DARK)
            draw2.text((MARGIN + 120, y2), before_value, font=body, fill=DARK)
            draw2.text((MARGIN + 220, y2), after_value, font=body, fill=DARK)
            draw2.text((MARGIN + 320, y2), delta_value, font=body, fill=BLUE)
            y2 += 18
    else:
        draw2.text((MARGIN, y2), "No spectral evidence values were present in the analysis response.", font=body, fill=MUTED)
        y2 += 20

    y2 += 14
    draw2.text((MARGIN, y2), "TEMPORAL EVIDENCE", font=section, fill=BLUE)
    y2 += 18
    temporal_text = (
        f"Observation count: {_value(payload.get('metrics', {}).get('observations_used'))}. "
        f"Analysis interval: {payload.get('interval', {}).get('from', 'UNAVAILABLE')} to {payload.get('interval', {}).get('to', 'UNAVAILABLE')}. "
        f"Velocity: {_value(payload.get('metrics', {}).get('velocity'))}. Acceleration: {_value(payload.get('metrics', {}).get('acceleration'))}. "
        f"Trend: {_value(payload.get('metrics', {}).get('trend'))}."
    )
    y2 += _draw_wrapped(draw2, temporal_text, (MARGIN, y2), 595 - 2 * MARGIN, body, DARK, max_lines=6)

    y2 += 18
    draw2.text((MARGIN, y2), "SENTINEL-1 / SAR EVIDENCE", font=section, fill=BLUE)
    y2 += 18
    sar = payload.get("sar", {})
    draw2.text((MARGIN, y2), f"SAR STATUS: {'AVAILABLE' if sar.get('available') else 'UNAVAILABLE'}", font=bold, fill=DARK)
    y2 += 18
    if sar.get("available"):
        draw2.text((MARGIN, y2), f"SAR change: {_value(sar.get('change'))}   VV delta: {_value(sar.get('vv_delta'))}   VH delta: {_value(sar.get('vh_delta'))}", font=body, fill=DARK)
        y2 += 18
    else:
        draw2.text((MARGIN, y2), "Sentinel-1/SAR evidence is unavailable for the selected interval; the assessment relies on the available optical temporal evidence.", font=body, fill=MUTED)
        y2 += 30

    y2 += 14
    draw2.text((MARGIN, y2), "ANALYST INTERPRETATION", font=section, fill=BLUE)
    y2 += 18
    bullets = [
        "Observed evidence: " + (summary if summary else "Grounded summary unavailable."),
        "Spectral evidence: NDVI and NDWI changes are reported as measured values for the selected temporal pair.",
        "Temporal behavior: velocity and acceleration should be interpreted as temporal response indicators, not as direct proof of physical cause.",
        "Cross-modal evidence: SAR is included only when valid Sentinel-1 evidence exists for the pairing.",
    ]
    for index, item in enumerate(bullets, start=1):
        y2 += _draw_wrapped(draw2, f"{index}. {item}", (MARGIN, y2), 595 - 2 * MARGIN, body, DARK, max_lines=3)
        y2 += 8

    y2 += 10
    draw2.text((MARGIN, y2), "EVIDENCE LIMITATIONS", font=section, fill=BLUE)
    y2 += 18
    for limitation in payload.get("limitations", [])[:5]:
        y2 += _draw_wrapped(draw2, f"• {limitation}", (MARGIN, y2), 595 - 2 * MARGIN, small, DARK, max_lines=2)
        y2 += 6

    y2 += 10
    draw2.text((MARGIN, y2), "DATA / MODALITY INFORMATION", font=section, fill=BLUE)
    y2 += 18
    info_rows = [
        ("Primary modality", _value(payload.get("metrics", {}).get("modality"))),
        ("Observation interval", f"{payload.get('interval', {}).get('from', 'UNAVAILABLE')} to {payload.get('interval', {}).get('to', 'UNAVAILABLE')}"),
        ("Observations used", _value(payload.get("metrics", {}).get("observations_used"))),
        ("Available SAR evidence", "YES" if sar.get("available") else "NO"),
        ("Available optical evidence", "YES" if before_path or after_path else "NO"),
    ]
    _draw_metric_table(draw2, MARGIN, y2, info_rows, body)

    draw1.text((MARGIN, 820), "GeoSpectra — offline/on-premises analysis", font=small, fill=MUTED)
    draw2.text((MARGIN, 820), "GeoSpectra — offline/on-premises analysis", font=small, fill=MUTED)

    buffer = io.BytesIO()
    page1.save(buffer, format="PDF", resolution=72.0, save_all=True, append_images=[page2])
    return buffer.getvalue()

