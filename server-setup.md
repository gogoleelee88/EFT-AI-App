# GPU 서버 배포 준비 명령

## 1) SSH 접속
```bash
ssh -p 20233 moodtalk@modulabs.ddns.net
```

## 2) 디렉토리 구조 생성
```bash
# 앱 루트 및 배포 디렉토리 준비
APP_ROOT="$HOME/tocmood/moodtalk-public"
UPLOAD_DIR="$APP_ROOT/.deploy_upload"
STATIC_ROOT="$APP_ROOT/static-frontend"
RELEASES_DIR="$APP_ROOT/releases"

echo "📁 Creating directory structure..."
mkdir -p "$UPLOAD_DIR" "$RELEASES_DIR" "$STATIC_ROOT"

echo "✅ Directories created:"
echo "  - APP_ROOT: $APP_ROOT"
echo "  - UPLOAD_DIR: $UPLOAD_DIR"
echo "  - STATIC_ROOT: $STATIC_ROOT"
echo "  - RELEASES_DIR: $RELEASES_DIR"
```

## 3) FastAPI 정적 파일 서빙 설정 (필요한 경우)

현재 FastAPI에서 정적 파일 서빙이 안 되어 있다면 추가:

```python
# backend/main.py에 추가
from fastapi.staticfiles import StaticFiles

# 맨 마지막에 추가 (다른 라우터 다음에)
app.mount("/", StaticFiles(directory="/home/moodtalk/tocmood/moodtalk-public/static-frontend", html=True), name="static")
```

## 4) 서비스 재시작
```bash
# 설정 변경 후 재시작
systemctl --user restart eft-api

# 상태 확인
systemctl --user status eft-api
```

## 5) 권한 확인
```bash
# 디렉토리 권한 확인
ls -la "$HOME/tocmood/moodtalk-public/"

# 쓰기 권한이 없다면
chmod 755 "$HOME/tocmood/moodtalk-public"
chmod 755 "$HOME/tocmood/moodtalk-public/static-frontend"
```

## 6) 테스트용 index.html 생성 (선택사항)
```bash
# 테스트용 파일
cat > "$HOME/tocmood/moodtalk-public/static-frontend/index.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>EFT AI - Deployment Test</title>
</head>
<body>
    <h1>🚀 Deployment Ready!</h1>
    <p>서버 준비 완료. GitHub Actions 배포를 기다리는 중...</p>
    <p>Time: <span id="time"></span></p>
    <script>
        document.getElementById('time').textContent = new Date().toLocaleString();
    </script>
</body>
</html>
EOF

echo "✅ Test file created. Visit: https://moodtalk.app"
```