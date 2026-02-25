from __future__ import annotations

from pathlib import Path
import numpy as np

from scripts.har_core3.config import L0_LABELS
from scripts.har_core3.split_subject import read_subject_split


def _mask_by_subject(subjects: np.ndarray, allow: list[int]) -> np.ndarray:
    allow_set = {int(x) for x in allow}
    return np.asarray([int(s) in allow_set for s in subjects], dtype=bool)


def evaluate_rf(model_path: Path, feature_npz: Path, split_json: Path, report_dir: Path, tag: str = "rf") -> None:
    try:
        import joblib
        from sklearn.metrics import classification_report, confusion_matrix, f1_score
    except Exception as exc:
        raise RuntimeError("evaluate_rf requires scikit-learn and joblib.") from exc

    data = np.load(feature_npz, allow_pickle=True)
    split = read_subject_split(split_json)
    test_mask = _mask_by_subject(data["subject_id"], split["test_subjects"])

    X_test = data["Xf"][test_mask]
    y_test = data["y"][test_mask]
    model = joblib.load(model_path)
    y_pred = model.predict(X_test)

    report_dir.mkdir(parents=True, exist_ok=True)

    macro_f1 = float(f1_score(y_test, y_pred, average="macro"))
    active_labels = sorted(int(v) for v in np.unique(y_test).tolist())
    macro_f1_active = (
        float(f1_score(y_test, y_pred, labels=active_labels, average="macro")) if active_labels else 0.0
    )
    metrics_path = report_dir / f"metrics_{tag}.csv"
    metric_rows = [
        "metric,value",
        f"macro_f1,{macro_f1:.6f}",
        f"macro_f1_active,{macro_f1_active:.6f}",
    ]

    per_cls = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    per_class_path = report_dir / f"per_class_{tag}.csv"
    lines = ["class,precision,recall,f1,support"]
    for i, label in enumerate(L0_LABELS):
        row = per_cls.get(str(i), None)
        if row is None:
            lines.append(f"{label},0,0,0,0")
        else:
            lines.append(
                f"{label},{row['precision']:.6f},{row['recall']:.6f},{row['f1-score']:.6f},{int(row['support'])}"
            )
    per_class_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    cm = confusion_matrix(y_test, y_pred, labels=list(range(len(L0_LABELS))))
    cm_path = report_dir / f"confusion_{tag}.csv"
    cm_lines = ["," + ",".join(L0_LABELS)]
    for i, label in enumerate(L0_LABELS):
        cm_lines.append(label + "," + ",".join(str(int(v)) for v in cm[i]))
    cm_path.write_text("\n".join(cm_lines) + "\n", encoding="utf-8")

    prediction_format = "parquet"
    try:
        import pandas as pd

        pred_df = pd.DataFrame({"y_true": y_test.astype(int), "y_pred": y_pred.astype(int)})
        pred_df.to_parquet(report_dir / f"predictions_{tag}.parquet", index=False)
    except Exception:
        prediction_format = "csv_fallback"
        pred_path = report_dir / f"predictions_{tag}.csv"
        pred_lines = ["y_true,y_pred"]
        pred_lines.extend(f"{int(t)},{int(p)}" for t, p in zip(y_test.tolist(), y_pred.tolist()))
        pred_path.write_text("\n".join(pred_lines) + "\n", encoding="utf-8")

    metric_rows.append(f"prediction_format,{prediction_format}")
    metrics_path.write_text("\n".join(metric_rows) + "\n", encoding="utf-8")

    try:
        import matplotlib.pyplot as plt

        fig = plt.figure(figsize=(7, 6))
        ax = fig.add_subplot(111)
        im = ax.imshow(cm, interpolation="nearest")
        ax.set_xticks(range(len(L0_LABELS)))
        ax.set_xticklabels(L0_LABELS, rotation=45, ha="right")
        ax.set_yticks(range(len(L0_LABELS)))
        ax.set_yticklabels(L0_LABELS)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True")
        fig.colorbar(im, ax=ax)
        fig.tight_layout()
        fig.savefig(report_dir / f"confusion_{tag}.png", dpi=150)
        plt.close(fig)
    except Exception:
        # PNG is optional; CSV confusion matrix is always saved.
        pass
