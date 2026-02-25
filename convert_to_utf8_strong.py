import glob, pathlib, unicodedata

candidates = glob.glob("backend/**/*.py", recursive=True)

converted = []
failed = []

try_encs = ("cp949", "euc-kr", "cp1252", "latin1")

def clean_text(text: str):
    removed = 0
    out = []
    for ch in text:
        code = ord(ch)
        if ch in ("\t","\n","\r"):
            out.append(ch); continue
        if (0 <= code <= 31) or (127 <= code <= 159):
            removed += 1; continue
        if 0xE000 <= code <= 0xF8FF:
            removed += 1; continue
        cat = unicodedata.category(ch)
        if cat in ("Cf","Cs","Co","Cn"):
            removed += 1; continue
        if not ch.isprintable():
            removed += 1; continue
        out.append(ch)
    return "".join(out), removed

for p in candidates:
    path = pathlib.Path(p)

    # 이미 UTF-8이면 스킵
    try:
        path.read_text(encoding="utf-8")
        continue
    except Exception:
        pass

    raw = path.read_bytes()
    text = None
    used = None

    for enc in try_encs:
        try:
            text = raw.decode(enc)
            used = enc
            break
        except Exception:
            continue

    if text is None:
        failed.append(p)
        continue

    bak = path.with_suffix(path.suffix + ".bak")
    if not bak.exists():
        bak.write_bytes(raw)

    cleaned, removed = clean_text(text)
    path.write_text(cleaned, encoding="utf-8", newline="\n")
    converted.append((p, used, removed))

print("CONVERTED:", len(converted))
for p, enc, removed in converted[:200]:
    print("-", p, "<=", enc, f"(removed_weird={removed})")

print("FAILED:", len(failed))
for p in failed[:200]:
    print("-", p)
