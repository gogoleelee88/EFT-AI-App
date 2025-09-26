# GitHub Secrets 설정 가이드

## 🔐 GitHub Repository Settings

1. **GitHub 레포지토리로 이동**: https://github.com/gogoleelee88/EFT-AI-App
2. **Settings** 탭 클릭
3. **Secrets and variables** → **Actions** 클릭
4. **New repository secret** 버튼으로 아래 값들 추가

## 📋 추가할 Secrets 목록

### 서버 접속 정보
```
Name: SSH_HOST
Value: modulabs.ddns.net
```

```
Name: SSH_PORT
Value: 20233
```

```
Name: SSH_USER
Value: moodtalk
```

```
Name: SSH_KEY
Value: [SSH 개인키 내용 - 아래 참고]
```

### 서버 경로 정보
```
Name: APP_ROOT
Value: /home/moodtalk/tocmood/moodtalk-public
```

```
Name: DEPLOY_UPLOAD_DIR
Value: /home/moodtalk/tocmood/moodtalk-public/.deploy_upload
```

```
Name: STATIC_ROOT
Value: /home/moodtalk/tocmood/moodtalk-public/static-frontend
```

## 🔑 SSH 키 생성 방법 (서버에서 실행)

SSH로 서버 접속 후 아래 실행:

```bash
# GitHub Actions용 SSH 키 생성
ssh-keygen -t ed25519 -C "github-actions@moodtalk.app" -f ~/.ssh/github_actions_key

# 공개키를 authorized_keys에 추가
cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys

# 개인키 내용 출력 (GitHub Secret에 복사)
echo "=== SSH_KEY Secret 값 (복사해서 GitHub에 추가) ==="
cat ~/.ssh/github_actions_key
echo "=== 복사 끝 ==="

# 권한 설정
chmod 600 ~/.ssh/github_actions_key
chmod 644 ~/.ssh/github_actions_key.pub
```

## 🗂️ 서버 디렉토리 생성 명령

```bash
# 디렉토리 구조 생성
APP_ROOT="$HOME/tocmood/moodtalk-public"
UPLOAD_DIR="$APP_ROOT/.deploy_upload"
STATIC_ROOT="$APP_ROOT/static-frontend"
RELEASES_DIR="$APP_ROOT/releases"

echo "📁 Creating directory structure..."
mkdir -p "$UPLOAD_DIR" "$RELEASES_DIR" "$STATIC_ROOT"

echo "✅ Directories created:"
ls -la "$APP_ROOT"

# 테스트용 index.html
cat > "$STATIC_ROOT/index.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>EFT AI - Server Ready</title>
</head>
<body>
    <h1>🚀 Server Ready for CI/CD!</h1>
    <p>서버 준비 완료. GitHub Actions 배포를 기다리는 중...</p>
    <p>Time: <span id="time"></span></p>
    <script>
        document.getElementById('time').textContent = new Date().toLocaleString();
    </script>
</body>
</html>
EOF

echo "✅ Test file created. Check: https://moodtalk.app"
```

## ⚙️ FastAPI 정적 파일 서빙 (필요시)

만약 현재 FastAPI에서 정적 파일 서빙이 안 되어 있다면:

```python
# backend/main.py 맨 마지막에 추가
from fastapi.staticfiles import StaticFiles

# 다른 모든 라우터 등록 후 맨 마지막에
app.mount("/", StaticFiles(directory="/home/moodtalk/tocmood/moodtalk-public/static-frontend", html=True), name="static")
```

추가 후 서비스 재시작:
```bash
systemctl --user restart eft-api
```