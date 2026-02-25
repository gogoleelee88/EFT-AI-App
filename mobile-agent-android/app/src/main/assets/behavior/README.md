Place on-device behavior model files here.

Priority order used by app:

1. Direct L1 model (preferred if available):
- `behavior_l1.tflite`
- `l1_labels.txt` (one label per line; output index order)

2. L0 HAR model + on-device L1 mapper (fallback when L1 model is absent):
- `har_l0.tflite`
- `l0_labels.txt`

3. Built-in heuristic fallback:
- used only when both model paths are unavailable

Expected tensor interface for both `.tflite` models:

- Input tensor shape: `[1, T, C]` (float32), where `T` is typically 128 and `C >= 3`.
- Input channel order: normalized `x, y, z` accelerometer.
- Output tensor shape: `[1, N]` logits/probabilities.

Output label order:

- L1 model (N=10): `commute, work_focus, meeting, workout, meal, chores, relax, sleep, social, unknown_event`
- L0 model (N=7): `walk, upstairs, downstairs, sit, stand, lay, unknown`
