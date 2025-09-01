# 백엔드 아키텍처 전략 문서

**프로젝트**: EFT 개인 심리관리 AI 명상앱  
**문서 목적**: 전문가 자문 및 기술 검토용  
**작성일**: 2025년 8월 15일

---

## 📋 요약 (Executive Summary)

EFT 기반 AI 심리관리 앱의 백엔드 아키텍처는 **단계별 진화 전략**을 채택합니다. MVP 단계에서는 Firebase로 빠른 개발과 안정성을 확보하고, 사용자 증가와 비즈니스 요구사항 변화에 따라 Supabase로 점진적 전환을 고려합니다.

---

## 🎯 현재 백엔드 선택: Firebase

### 선정 이유

#### 1. 개발 속도 우선
- **MVP 출시 시간**: 2.5개월 목표
- **학습 곡선**: 최소화 필요
- **통합 서비스**: 인증+DB+호스팅 올인원
- **검증된 솔루션**: 대규모 서비스 운영 경험

#### 2. 기술적 적합성
```javascript
// EFT 앱에 특히 적합한 Firebase 기능들
const firebaseAdvantages = {
  authentication: {
    socialLogin: "구글/애플 로그인 (3초 가입)",
    anonymousAuth: "게스트 모드 지원",
    emailAuth: "전통적 이메일 가입"
  },
  
  realtime: {
    chatbot: "AI 상담사 실시간 대화",
    liveSession: "실시간 EFT 세션 동기화",
    notifications: "즉시 알림 시스템"
  },
  
  offline: {
    caching: "오프라인 EFT 세션 가능",
    sync: "온라인 복귀 시 자동 동기화",
    pwa: "PWA 완벽 지원"
  },
  
  storage: {
    userProfiles: "사용자 프로필 이미지",
    sessionRecords: "음성 가이드 파일",
    analytics: "감정 패턴 데이터"
  }
};
```

#### 3. 비즈니스 고려사항
- **초기 비용**: 무료 티어로 MVP 운영 가능
- **확장성**: 자동 스케일링
- **보안**: Google 수준의 엔터프라이즈 보안
- **컴플라이언스**: GDPR, HIPAA 준수 가능

---

## 🔄 장기 전환 전략: Supabase

### 전환 검토 기준

#### 정량적 지표
- **월 활성 사용자**: 10,000명 이상
- **월 Firebase 비용**: $500 이상
- **데이터 복잡도**: 복합 쿼리 필요성 증가
- **개발팀 규모**: 백엔드 전담 개발자 확보

#### 정성적 요구사항
- **데이터 소유권**: 완전한 데이터 제어 필요
- **커스터마이징**: 고급 비즈니스 로직 구현
- **비용 최적화**: 예측 가능한 요금제 선호
- **오픈소스**: 벤더 락인 회피 전략

### 3단계 점진적 전환 전략

#### Phase 1: Firebase 100% (MVP ~ 1K 사용자)
```
기간: 2025년 8월 ~ 2026년 2월 (6개월)
목표: 제품-시장 적합성 확보
전략: Firebase 생태계 완전 활용
```

#### Phase 2: 하이브리드 운영 (1K ~ 10K 사용자)
```
기간: 2026년 3월 ~ 2026년 12월 (9개월)
목표: 기술 스택 다변화 및 위험 분산
전략: 
- 기존 기능: Firebase 유지
- 신규 기능: Supabase 도입
- 점진적 마이그레이션 경험 축적
```

#### Phase 3: Supabase 완전 전환 (10K+ 사용자)
```
기간: 2027년 1월 ~ 2027년 6월 (6개월)
목표: 비용 최적화 및 기술 자립도 확보
전략:
- 데이터 마이그레이션
- 사용자 재인증 프로세스
- 성능 모니터링 및 최적화
```

---

## 💰 비용 분석

### Firebase vs Supabase 비용 비교

#### Firebase (Google Cloud)
```
무료 티어:
- 동시 연결: 100개
- 저장 용량: 1GB
- 대역폭: 10GB/월

유료 ($25/월 기준):
- 읽기: $0.06/100K
- 쓰기: $0.18/100K
- 저장: $0.18/GB/월
- 대역폭: $0.12/GB

10K 사용자 예상 비용: $300-500/월
```

#### Supabase 
```
무료 티어:
- 프로젝트: 2개
- 데이터베이스: 500MB
- API 요청: 무제한

Pro 플랜 ($25/월):
- 데이터베이스: 8GB 포함
- 대역폭: 250GB 포함
- 백업: 7일 자동

10K 사용자 예상 비용: $150-300/월
```

### ROI 분석
- **전환 비용**: $50K-80K (개발 3-4개월)
- **월 절약액**: $150-200
- **손익분기점**: 20-25개월
- **3년 총 절약**: $200K-300K

---

## 🛠️ 마이그레이션 기술 전략

### 데이터 마이그레이션 계획

#### 1. 스키마 설계
```sql
-- Firebase NoSQL → PostgreSQL 변환 예시
-- Firebase: users/{uid}/sessions/{sessionId}
-- PostgreSQL:
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) UNIQUE, -- 마이그레이션 연결점
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE eft_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  emotion_before INTEGER CHECK (emotion_before BETWEEN 1 AND 10),
  emotion_after INTEGER CHECK (emotion_after BETWEEN 1 AND 10),
  session_data JSONB, -- 유연성을 위한 JSON 필드
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. 점진적 마이그레이션 아키텍처
```javascript
// 하이브리드 기간 중 데이터 라우팅
const dataRouter = {
  // 읽기: 두 소스에서 병합
  async getUserData(userId) {
    const [firebaseData, supabaseData] = await Promise.all([
      firebase.collection('users').doc(userId).get(),
      supabase.from('users').select('*').eq('firebase_uid', userId)
    ]);
    
    return mergeUserData(firebaseData, supabaseData);
  },
  
  // 쓰기: 양쪽에 동시 저장 (일관성 보장)
  async saveSession(userId, sessionData) {
    const transaction = await db.transaction();
    try {
      await Promise.all([
        firebase.collection('sessions').add(sessionData),
        supabase.from('eft_sessions').insert(sessionData)
      ]);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
```

### 무중단 전환 전략

#### 1. Blue-Green 배포
- **Blue**: 기존 Firebase 환경 유지
- **Green**: 새로운 Supabase 환경 구축
- **스위치**: DNS/로드밸런서 라우팅 변경

#### 2. 사용자 영향 최소화
```javascript
// 점진적 사용자 마이그레이션
const migrationStrategy = {
  week1: "개발팀 내부 테스트 (1%)",
  week2: "베타 테스터 그룹 (5%)",
  week3: "신규 사용자만 (25%)",
  week4: "전체 사용자 (100%)"
};

// 롤백 계획
const rollbackPlan = {
  trigger: "오류율 1% 초과 또는 성능 20% 저하",
  action: "즉시 Firebase로 트래픽 전환",
  recovery: "24시간 내 완전 복구"
};
```

---

## 🔍 위험 분석 및 대응 방안

### 주요 위험 요소

#### 1. 기술적 위험
| 위험 | 확률 | 영향도 | 대응 방안 |
|------|------|--------|-----------|
| 데이터 손실 | 낮음 | 치명적 | 실시간 백업, 트랜잭션 보장 |
| 성능 저하 | 중간 | 높음 | 성능 테스트, 점진적 롤아웃 |
| 호환성 문제 | 높음 | 중간 | 철저한 테스트, API 래퍼 계층 |

#### 2. 비즈니스 위험
| 위험 | 확률 | 영향도 | 대응 방안 |
|------|------|--------|-----------|
| 사용자 이탈 | 중간 | 높음 | 사용자 경험 최우선, 롤백 준비 |
| 개발 지연 | 높음 | 중간 | 충분한 버퍼 시간, 단계별 진행 |
| 예산 초과 | 중간 | 중간 | 정확한 비용 추정, 단계별 승인 |

---

## 📊 의사결정 프레임워크

### 전환 Go/No-Go 체크리스트

#### 필수 조건 (모두 충족 시 전환)
- [ ] 월 활성 사용자 10,000명 이상
- [ ] 백엔드 전담 개발자 2명 이상 확보
- [ ] Firebase 월 비용 $500 이상
- [ ] 복합 SQL 쿼리 필요성 월 50회 이상

#### 선택 조건 (2개 이상 충족 시 전환 고려)
- [ ] 데이터 소유권 요구사항 발생
- [ ] 경쟁사 대비 기술적 차별화 필요
- [ ] 투자자/파트너사의 오픈소스 선호
- [ ] 글로벌 확장으로 인한 지역별 규제 대응

### 성공 지표 (KPI)

#### 기술적 지표
- **시스템 가용성**: 99.9% 이상 유지
- **응답 시간**: 평균 200ms 이하
- **데이터 정합성**: 99.99% 이상
- **마이그레이션 기간**: 예정된 6개월 내 완료

#### 비즈니스 지표
- **사용자 이탈률**: 5% 이하
- **고객 만족도**: 4.5/5.0 이상 유지
- **비용 절감**: 월 30% 이상 절약
- **개발 생산성**: 마이그레이션 후 3개월 내 원상 복구

---

## 🎯 권고사항

### 전문가 검토 요청 사항

1. **아키텍처 설계 검토**
   - 제안된 3단계 전환 전략의 타당성
   - 하이브리드 운영 기간의 적정성
   - 데이터 일관성 보장 방안

2. **비용 효율성 분석**
   - ROI 계산의 정확성
   - 숨겨진 비용 요소 식별
   - 대안적 솔루션 검토

3. **위험 관리 방안**
   - 식별되지 않은 위험 요소
   - 위험 완화 전략의 실효성
   - 업계 모범 사례 적용 가능성

4. **기술 스택 적정성**
   - EFT 앱 도메인에 대한 기술 선택의 적합성
   - 확장성 및 유지보수성 관점
   - 최신 기술 트렌드 반영도

---

**연락처**: [개발팀 연락처]  
**문서 버전**: v1.0  
**다음 검토 예정일**: 2025년 12월 (사용자 1,000명 달성 시점)