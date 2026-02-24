from pathlib import Path

p = Path(r"backend/services/intake_storage.py")
b = p.read_bytes()

def try_decode(enc):
    try:
        return b.decode(enc), enc
    except Exception:
        return None, None

text, enc = None, None
for e in ["utf-8", "cp949", "euc-kr", "cp1252", "latin1"]:
    t, used = try_decode(e)
    if t is not None:
        text, enc = t, used
        break

print("decoded_with:", enc)

# 제어문자 제거 (탭/줄바꿈은 유지)
clean = []
removed = 0
for ch in text:
    code = ord(ch)
    if ch in ("\t", "\n", "\r"):
        clean.append(ch)
    elif (0 <= code <= 31) or (127 <= code <= 159):
        removed += 1
        # skip
    else:
        clean.append(ch)

clean_text = "".join(clean)

bak = p.with_suffix(".py.bak2")
if not bak.exists():
    bak.write_bytes(b)

p.write_text(clean_text, encoding="utf-8", newline="\n")
print("removed_control_chars:", removed)
print("wrote_utf8:", str(p))
