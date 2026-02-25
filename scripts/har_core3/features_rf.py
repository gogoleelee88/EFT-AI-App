from __future__ import annotations

from pathlib import Path
import numpy as np

from scripts.har_core3.config import TARGET_HZ


_EPS = 1e-12


def _time_stats(arr: np.ndarray, prefix: str) -> tuple[np.ndarray, list[str]]:
    mean = np.mean(arr, axis=1)
    std = np.std(arr, axis=1)
    min_v = np.min(arr, axis=1)
    max_v = np.max(arr, axis=1)
    energy = np.mean(arr * arr, axis=1)
    q25 = np.quantile(arr, 0.25, axis=1)
    q75 = np.quantile(arr, 0.75, axis=1)
    iqr = q75 - q25
    feats = np.column_stack([mean, std, min_v, max_v, energy, iqr]).astype(np.float32)
    names = [
        f"{prefix}_mean",
        f"{prefix}_std",
        f"{prefix}_min",
        f"{prefix}_max",
        f"{prefix}_energy",
        f"{prefix}_iqr",
    ]
    return feats, names


def _band_ratio(power_no_dc: np.ndarray, total: np.ndarray, mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return np.zeros(power_no_dc.shape[0], dtype=np.float32)
    band = np.sum(power_no_dc[:, mask], axis=1)
    safe_total = np.where(total > _EPS, total, 1.0)
    ratio = np.where(total > _EPS, band / safe_total, 0.0)
    return ratio.astype(np.float32)


def _freq_stats(arr: np.ndarray, prefix: str, sampling_hz: int) -> tuple[np.ndarray, list[str]]:
    n, t = arr.shape
    centered = arr - np.mean(arr, axis=1, keepdims=True)
    spec = np.fft.rfft(centered, axis=1)
    power = (spec.real * spec.real + spec.imag * spec.imag).astype(np.float64, copy=False)
    if power.shape[1] <= 1:
        zeros = np.zeros((n, 6), dtype=np.float32)
        names = [
            f"{prefix}_dom_freq_hz",
            f"{prefix}_spec_entropy",
            f"{prefix}_dom_power_ratio",
            f"{prefix}_band_0_3_ratio",
            f"{prefix}_band_3_10_ratio",
            f"{prefix}_band_10_20_ratio",
        ]
        return zeros, names

    power_no_dc = power[:, 1:]
    total = np.sum(power_no_dc, axis=1)
    safe_total = np.where(total > _EPS, total, 1.0)

    dom_rel = np.argmax(power_no_dc, axis=1)
    dom_idx = dom_rel + 1
    freqs = np.fft.rfftfreq(t, d=1.0 / float(sampling_hz))
    dom_freq = freqs[dom_idx]

    dom_power = power_no_dc[np.arange(n), dom_rel]
    dom_power_ratio = np.where(total > _EPS, dom_power / safe_total, 0.0)

    p = np.divide(
        power_no_dc,
        safe_total[:, None],
        out=np.zeros_like(power_no_dc),
        where=safe_total[:, None] > 0,
    )
    entropy = -np.sum(p * np.log(p + _EPS), axis=1)
    entropy_norm = (
        entropy / np.log(power_no_dc.shape[1]) if power_no_dc.shape[1] > 1 else np.zeros(n, dtype=np.float64)
    )

    freq_no_dc = freqs[1:]
    low_mask = (freq_no_dc >= 0.1) & (freq_no_dc < 3.0)
    mid_mask = (freq_no_dc >= 3.0) & (freq_no_dc < 10.0)
    high_mask = (freq_no_dc >= 10.0) & (freq_no_dc <= 20.0)
    low_ratio = _band_ratio(power_no_dc, total, low_mask)
    mid_ratio = _band_ratio(power_no_dc, total, mid_mask)
    high_ratio = _band_ratio(power_no_dc, total, high_mask)

    feats = np.column_stack(
        [
            dom_freq.astype(np.float32),
            entropy_norm.astype(np.float32),
            dom_power_ratio.astype(np.float32),
            low_ratio,
            mid_ratio,
            high_ratio,
        ]
    ).astype(np.float32)
    names = [
        f"{prefix}_dom_freq_hz",
        f"{prefix}_spec_entropy",
        f"{prefix}_dom_power_ratio",
        f"{prefix}_band_0_3_ratio",
        f"{prefix}_band_3_10_ratio",
        f"{prefix}_band_10_20_ratio",
    ]
    return feats, names


def _pair_corr(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a0 = a - np.mean(a, axis=1, keepdims=True)
    b0 = b - np.mean(b, axis=1, keepdims=True)
    num = np.mean(a0 * b0, axis=1)
    den = np.sqrt(np.mean(a0 * a0, axis=1) * np.mean(b0 * b0, axis=1))
    corr = np.divide(num, den, out=np.zeros_like(num), where=den > 1e-6)
    return corr.astype(np.float32)


def to_rf_features(X: np.ndarray, sampling_hz: int = TARGET_HZ) -> tuple[np.ndarray, list[str]]:
    n, _t, c = X.shape
    blocks: list[np.ndarray] = []
    names: list[str] = []

    for ci in range(c):
        sig = X[:, :, ci]
        t_feat, t_names = _time_stats(sig, f"ch{ci}")
        f_feat, f_names = _freq_stats(sig, f"ch{ci}", sampling_hz=sampling_hz)
        blocks.append(t_feat)
        blocks.append(f_feat)
        names.extend(t_names)
        names.extend(f_names)

    mag = np.linalg.norm(X, axis=2)
    t_mag, t_mag_names = _time_stats(mag, "mag")
    f_mag, f_mag_names = _freq_stats(mag, "mag", sampling_hz=sampling_hz)
    blocks.append(t_mag)
    blocks.append(f_mag)
    names.extend(t_mag_names)
    names.extend(f_mag_names)

    for i in range(c):
        for j in range(i + 1, c):
            corr = _pair_corr(X[:, :, i], X[:, :, j]).reshape(n, 1)
            blocks.append(corr)
            names.append(f"corr_ch{i}_ch{j}")

    Xf = np.concatenate(blocks, axis=1).astype(np.float32)
    return Xf, names


def build_feature_file(in_npz: Path, out_npz: Path) -> None:
    raw = np.load(in_npz, allow_pickle=True)
    Xf, names = to_rf_features(raw["X"], sampling_hz=TARGET_HZ)
    out_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_npz,
        Xf=Xf,
        y=raw["y"],
        subject_id=raw["subject_id"],
        dataset_id=raw["dataset_id"],
        feature_names=np.asarray(names, dtype=object),
    )
