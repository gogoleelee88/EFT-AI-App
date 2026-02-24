from pathlib import Path
import unicodedata

p = Path(r"backend/services/intake_storage.py")
raw = p.read_bytes()

# 1) 가능한 인코딩으로 최대한 복구
text = None
used = None
for enc in ["cp949", "euc-kr", "cp1252", "latin1"]:
    try:
        text = raw.decode(enc)
        used = enc
        break
    except Exception:
        pass

if text is None:
    raise SystemExit("❌ cannot decode intake_storage.py with cp949/euc-kr/cp1252/latin1")

print("decoded_with:", used)

# 2) 제어문자/비가시/PUA 제거(탭/줄바꿈 유지)
out = []
removed = 0
for ch in text:
    code = ord(ch)

    if ch in ("\t", "\n", "\r"):
        out.append(ch); continue

    if (0 <= code <= 31) or (127 <= code <= 159):
        removed += 1; continue

    if 0xE000 <= code <= 0xF8FF:  # PUA
        removed += 1; continue

    cat = unicodedata.category(ch)
    if cat in ("Cf", "Cs", "Co", "Cn"):
        removed += 1; continue

    if not ch.isprintable():
        removed += 1; continue

    out.append(ch)

clean = "".join(out)

# 3) 원본 백업
bak = p.with_suffix(p.suffix + ".raw.bak")
if not bak.exists():
    bak.write_bytes(raw)

# 4) UTF-8로 저장
p.write_text(clean, encoding="utf-8", newline="\n")
print("removed_weird_chars:", removed)
print("wrote_utf8:", str(p))
