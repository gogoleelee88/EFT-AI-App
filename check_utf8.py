import glob, pathlib

bad = []
for p in glob.glob("backend/**/*.py", recursive=True):
    try:
        pathlib.Path(p).read_text(encoding="utf-8")
    except Exception as e:
        bad.append((p, str(e)))

print("BAD FILES:", len(bad))
for p, e in bad[:80]:
    print("-", p, "=>", e)
