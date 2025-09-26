# 📢 **TOCMOOD 공지사항 작성 매뉴얼**
> **초등학생도 쉽게 따라할 수 있는 단계별 가이드**

---

## 🎯 **1단계: 준비하기**

### **필요한 것들**
- ✅ 컴퓨터 (윈도우, 맥 상관없음)
- ✅ 인터넷 연결
- ✅ 관리자 비밀번호 (API 키)

### **서버 켜기**
1. **폴더 열기**
   - `C:\Users\lco20\Desktop\moodtalk_public\backend` 폴더로 가세요

2. **명령창 열기**
   - 폴더에서 `Shift + 우클릭` → "PowerShell 창 여기서 열기"

3. **서버 실행**
   ```
   python main.py
   ```

4. **성공 확인**
   - 화면에 `서버가 시작되었습니다` 같은 메시지가 나오면 성공! ✅

---

## 🌟 **2단계: 첫 번째 공지사항 만들기**

### **간단한 공지 (복사해서 붙여넣기)**

**명령창에 이걸 그대로 복사해서 붙여넣으세요:**

```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"🎉 안녕하세요!\", \"body\": \"첫 번째 공지사항입니다\", \"severity\": \"info\", \"lang\": \"ko\"}"
```

**성공하면:**
- 긴 텍스트가 나오고 `"title": "🎉 안녕하세요!"` 같은 내용이 보입니다

---

## 🎨 **3단계: 예쁜 공지사항 만들기**

### **🎉 축하 공지 (초록색)**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"🎉 새로운 기능이 나왔어요!\", \"body\": \"**AI 상담**이 더 똑똑해졌습니다!\", \"severity\": \"success\", \"pinned\": true, \"lang\": \"ko\"}"
```

### **⚠️ 중요 공지 (노란색)**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"⚠️ 점검 안내\", \"body\": \"오늘 밤 12시에 **10분간 점검**합니다\", \"severity\": \"warning\", \"pinned\": true, \"lang\": \"ko\"}"
```

### **🚨 긴급 공지 (빨간색)**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"🚨 긴급공지\", \"body\": \"서버에 문제가 생겼습니다. 곧 고칠게요!\", \"severity\": \"critical\", \"pinned\": true, \"lang\": \"ko\"}"
```

### **💡 일반 공지 (파란색)**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"💡 팁 공유\", \"body\": \"EFT 탭핑을 **천천히** 해보세요!\", \"severity\": \"info\", \"lang\": \"ko\"}"
```

---

## 🔧 **4단계: 내 맘대로 공지 만들기**

### **기본 틀**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{
  \"title\": \"여기에 제목 쓰기\",
  \"body\": \"여기에 내용 쓰기\",
  \"severity\": \"색깔 정하기\",
  \"pinned\": true,
  \"lang\": \"ko\"
}"
```

### **바꿀 수 있는 것들**

**📝 제목 바꾸기**
- `\"title\": \"🎉 새 소식!\"` ← 여기서 🎉 새 소식! 부분 바꾸기

**📄 내용 바꾸기**
- `\"body\": \"안녕하세요 여러분!\"` ← 여기서 내용 바꾸기
- **굵게 쓰기**: `**굵은 글씨**`
- **줄 바꾸기**: `\\n` 넣기

**🎨 색깔 바꾸기**
- `\"severity\": \"info\"` ← 파란색 (일반)
- `\"severity\": \"success\"` ← 초록색 (좋은 소식)
- `\"severity\": \"warning\"` ← 노란색 (주의)
- `\"severity\": \"critical\"` ← 빨간색 (긴급)

**📌 위에 고정하기**
- `\"pinned\": true` ← 맨 위에 고정
- `\"pinned\": false` ← 일반 위치

---

## 🕒 **5단계: 시간 정해서 공지하기**

### **내일부터 일주일간 보여주기**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"📅 이벤트 공지\", \"body\": \"다음 주부터 **특별 이벤트** 시작!\", \"severity\": \"success\", \"startsAt\": \"2025-09-24T00:00:00Z\", \"endsAt\": \"2025-10-01T23:59:59Z\", \"lang\": \"ko\"}"
```

**시간 바꾸는 법:**
- `2025-09-24T00:00:00Z` ← 시작 날짜
- `2025-10-01T23:59:59Z` ← 끝 날짜
- 형식: `년-월-일T시:분:초Z`

---

## 👀 **6단계: 공지사항 확인하기**

### **모든 공지 보기**
```bash
curl http://localhost:8000/api/notices
```

### **웹브라우저로 예쁘게 보기**
1. 인터넷 브라우저 열기
2. 주소창에 입력: `http://localhost:8000/docs`
3. "notices" 부분 클릭
4. "GET /api/notices" 클릭
5. "Try it out" 버튼 클릭
6. "Execute" 버튼 클릭

---

## 🗑️ **7단계: 공지사항 삭제하기**

### **공지 ID 찾기**
```bash
curl http://localhost:8000/api/notices
```
- 결과에서 `"id": "abc-123-def"` 같은 부분 찾기

### **삭제하기**
```bash
curl -X DELETE http://localhost:8000/api/notices/여기에ID입력 -H "X-API-Key: test-admin-key-12345"
```

**예시:**
```bash
curl -X DELETE http://localhost:8000/api/notices/abc-123-def -H "X-API-Key: test-admin-key-12345"
```

---

## 🔍 **8단계: 앱에서 확인하기**

### **실제 앱에서 보기**
1. 새 브라우저 탭 열기
2. 주소창에 입력: `http://localhost:5173`
3. 앱 맨 위에 공지사항 배너가 나타나는지 확인!

---

## 🆘 **문제 해결하기**

### **"curl을 찾을 수 없습니다" 에러**
**Windows에서:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/notices" -Method Post -Headers @{"Content-Type"="application/json"; "X-API-Key"="test-admin-key-12345"} -Body '{"title":"테스트","body":"안녕하세요","severity":"info","lang":"ko"}'
```

### **"연결할 수 없습니다" 에러**
1. 서버가 실행 중인지 확인
2. `python main.py` 다시 실행
3. 주소가 `localhost:8000`인지 확인

### **"권한이 없습니다" 에러**
- API 키 확인: `test-admin-key-12345`가 맞는지 확인

---

## 📚 **치트시트 (빠른 참고용)**

### **자주 쓰는 명령어**

**📝 간단한 공지 만들기**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\":\"제목\",\"body\":\"내용\",\"severity\":\"info\",\"lang\":\"ko\"}"
```

**👀 공지 보기**
```bash
curl http://localhost:8000/api/notices
```

**🗑️ 공지 삭제**
```bash
curl -X DELETE http://localhost:8000/api/notices/ID -H "X-API-Key: test-admin-key-12345"
```

### **색깔표**
- 🔵 **info** = 파란색 (일반 정보)
- 🟢 **success** = 초록색 (좋은 소식)
- 🟡 **warning** = 노란색 (주의사항)
- 🔴 **critical** = 빨간색 (긴급상황)

---

## 🎨 **고급 기능**

### **영어 공지사항 만들기**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"🌟 Welcome!\", \"body\": \"Welcome to **TOCMOOD**!\", \"severity\": \"success\", \"lang\": \"en\"}"
```

### **공지사항 수정하기**
1. **수정할 공지 ID 찾기**
   ```bash
   curl http://localhost:8000/api/notices
   ```

2. **수정하기**
   ```bash
   curl -X PUT http://localhost:8000/api/notices/여기에ID -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"수정된 제목\", \"body\": \"수정된 내용\"}"
   ```

### **관리자 전용 - 모든 공지 보기 (삭제된 것도 포함)**
```bash
curl -H "X-API-Key: test-admin-key-12345" http://localhost:8000/api/notices/admin/all
```

---

## 📱 **실제 사용 시나리오**

### **🎯 시나리오 1: 신기능 출시**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"🚀 신기능 출시!\", \"body\": \"**Engine A/B 비교** 기능이 추가되었습니다!\\n\\n이제 두 개의 AI 모델을 동시에 비교할 수 있어요.\", \"severity\": \"success\", \"pinned\": true, \"lang\": \"ko\"}"
```

### **🎯 시나리오 2: 점검 안내**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"⚠️ 정기 점검 안내\", \"body\": \"**2025년 9월 25일 새벽 2시-3시**\\n서버 점검이 진행됩니다.\\n\\n점검 중에는 서비스 이용이 어려울 수 있습니다.\", \"severity\": \"warning\", \"pinned\": true, \"startsAt\": \"2025-09-24T12:00:00Z\", \"endsAt\": \"2025-09-25T15:00:00Z\", \"lang\": \"ko\"}"
```

### **🎯 시나리오 3: 일상 팁**
```bash
curl -X POST http://localhost:8000/api/notices -H "Content-Type: application/json" -H "X-API-Key: test-admin-key-12345" -d "{\"title\": \"💡 오늘의 마음 관리 팁\", \"body\": \"**호흡을 의식해보세요**\\n\\n하루에 5번, 3번씩 깊게 숨쉬기\\n마음이 훨씬 편안해집니다 🌿\", \"severity\": \"info\", \"pinned\": false, \"lang\": \"ko\"}"
```

---

## 🔧 **개발자를 위한 고급 설정**

### **환경 변수 설정**
```bash
# .env 파일에 추가
NOTICES_ADMIN_KEY=your-secure-admin-key-here
NOTICES_AUTO_REFRESH=300  # 5분마다 자동 새로고침
NOTICES_MAX_CACHE_SIZE=100  # 최대 캐시 크기
```

### **Docker로 실행하기**
```bash
# Dockerfile이 있다면
docker build -t moodtalk-backend .
docker run -p 8000:8000 -v ./backend/data:/app/data moodtalk-backend
```

### **프로덕션 배포 시 주의사항**
1. **보안 강화**
   - API 키를 환경변수로 관리
   - HTTPS 적용 필수
   - CORS 설정 검토

2. **데이터베이스 전환**
   - 파일 저장 → PostgreSQL/MySQL
   - 백업 및 복구 계획 수립

3. **모니터링**
   - 로그 수집 시스템 구축
   - 알림 시스템 연동

---

## 🎉 **완료!**

이제 여러분은 TOCMOOD 앱의 공지사항 관리자가 되었습니다!

**기억하세요:**
- 🎨 예쁜 이모지 사용하기
- 📝 간단명료한 제목 쓰기
- 💡 사용자가 이해하기 쉬운 내용 쓰기
- ⚠️ 중요한 공지는 `pinned: true`로 고정하기
- 🕒 시간 제한이 필요하면 `startsAt`, `endsAt` 사용하기

**문제가 생기면:**
- 서버 재시작: `python main.py`
- 앱 새로고침: `F5` 키 누르기
- 이 매뉴얼 다시 읽기 📖

**행복한 공지사항 관리 되세요! 🌟**

---

## 📞 **도움이 더 필요하다면**

- 📧 **이메일**: [프로젝트 관리자 이메일]
- 📱 **카카오톡**: [프로젝트 오픈채팅방]
- 💻 **GitHub 이슈**: [프로젝트 GitHub 주소]/issues

**이 매뉴얼을 북마크해두세요! 📌**