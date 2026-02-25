import glob, pathlib

candidates = glob.glob("backend/**/*.py", recursive=True)

converted = []
failed = []

for p in candidates:
    path = pathlib.Path(p)

    # 이미 UTF-8이면 스킵
    try:
        path.read_text(encoding="utf-8")
        continue
    except Exception:
        pass

    # CP949/EUC-KR 시도
    text = None
    used = None
    for enc in ("cp949", "euc-kr"):
        try:
            text = path.read_text(encoding=enc)
            used = enc
            break
        except Exception:
            continue

    if text is None:
        failed.append(p)
        continue

    bak = path.with_suffix(path.suffix + ".bak")
    if not bak.exists():
        bak.write_bytes(path.read_bytes())

    path.write_text(text, encoding="utf-8", newline="\n")
    converted.append((p, used))

print("CONVERTED:", len(converted))
for p, enc in converted[:200]:
    print("-", p, "<=", enc)

print("FAILED:", len(failed))
for p in failed[:200]:
    print("-", p)
