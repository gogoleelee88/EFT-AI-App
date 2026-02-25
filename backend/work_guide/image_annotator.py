from __future__ import annotations

import base64
import io
from typing import Optional

from PIL import Image, ImageDraw

from work_guide.schemas import BBox, Step


def decode_data_url_base64(raw_base64: str) -> bytes:
    value = (raw_base64 or "").strip()
    if not value:
        raise ValueError("empty screenshot_base64")
    if "," in value and value.lower().startswith("data:"):
        value = value.split(",", 1)[1]
    return base64.b64decode(value)


def encode_png_base64(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def image_size_from_bytes(image_bytes: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(image_bytes)) as image:
        return int(image.width), int(image.height)


def _pick_step_bbox(step: Step) -> Optional[BBox]:
    if step.fallback and step.fallback.bbox is not None:
        return step.fallback.bbox
    if step.target and step.target.bbox is not None:
        return step.target.bbox
    for candidate in step.candidates:
        if candidate.bbox is not None:
            return candidate.bbox
    return None


def annotate_first_step(image_bytes: bytes, step: Step) -> str:
    bbox = _pick_step_bbox(step)
    if bbox is None:
        with Image.open(io.BytesIO(image_bytes)) as image:
            return encode_png_base64(image.convert("RGB"))

    with Image.open(io.BytesIO(image_bytes)) as image:
        canvas = image.convert("RGB")
        draw = ImageDraw.Draw(canvas)

        x1 = int(max(0, bbox.x))
        y1 = int(max(0, bbox.y))
        x2 = int(min(canvas.width - 1, bbox.x + bbox.w))
        y2 = int(min(canvas.height - 1, bbox.y + bbox.h))

        stroke = max(2, int(min(canvas.width, canvas.height) * 0.004))
        draw.rectangle([x1, y1, x2, y2], outline=(255, 59, 48), width=stroke)

        center_x = (x1 + x2) // 2
        center_y = (y1 + y2) // 2
        arrow_start_x = max(10, x1 - int(0.12 * canvas.width))
        arrow_start_y = max(10, y1 - int(0.12 * canvas.height))
        draw.line([arrow_start_x, arrow_start_y, center_x, center_y], fill=(255, 59, 48), width=stroke)

        head_size = max(6, stroke * 3)
        draw.polygon(
            [
                (center_x, center_y),
                (center_x - head_size, center_y - head_size // 2),
                (center_x - head_size // 2, center_y - head_size),
            ],
            fill=(255, 59, 48),
        )

        badge_r = max(10, stroke * 3)
        badge_cx = max(badge_r + 2, x1)
        badge_cy = max(badge_r + 2, y1)
        draw.ellipse(
            [badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r],
            fill=(255, 59, 48),
            outline=(255, 255, 255),
            width=max(1, stroke // 2),
        )
        draw.text((badge_cx - badge_r // 3, badge_cy - badge_r // 2), "1", fill=(255, 255, 255))

        return encode_png_base64(canvas)


