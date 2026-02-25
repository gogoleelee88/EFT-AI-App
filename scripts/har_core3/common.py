from __future__ import annotations

from dataclasses import dataclass
import numpy as np


@dataclass
class RawSample:
    sequence: np.ndarray
    label_raw: str
    subject_id: int
    dataset_id: int
    sampling_hz: int

