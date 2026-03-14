# Planner 통합 설계서

## 1. 목적

웹과 앱을 "다른 기능 묶음"으로 운영하지 않고, 동일한 planner 제품을 두 개의 화면 셸에서 여는 구조로 재편한다.

핵심 원칙은 다음과 같다.

- 기능은 하나다. 웹 전용 planner, 앱 전용 planner를 따로 만들지 않는다.
- 도메인은 하나다. planner의 정합성은 서버가 책임진다.
- 셸만 다르다. 웹은 대량 편집, 앱은 빠른 확인과 실행에 최적화한다.
- 비즈니스 로직은 한 번만 구현한다. 클라이언트는 상태 캐시와 뷰 조합만 가진다.
- 단계적 전환을 전제로 한다. 기존 route, 기존 탭, 기존 동기화는 한 릴리스 이상 공존시킨다.

## 2. 현재 코드 기준 문제 정의

### 2.1 웹이 planner를 세 갈래로 분리함

- `frontend/src/routes.tsx:57` `/plan/day`
- `frontend/src/routes.tsx:60` `/add-alarm`
- `frontend/src/routes.tsx:61` `/deadline-planner`

현재 웹은 하나의 planner가 아니라 세 개의 진입점과 세 개의 상태 저장 방식을 가진다.

### 2.2 deadline planner가 서버 공통 도메인이 아님

- `frontend/src/services/deadlinePlannerService.ts:26`
- `frontend/src/hooks/useDeadlineGoals.ts:59`

마감 계획은 `localStorage` 기반 CRUD로만 관리된다. 이 상태에서는 앱과 웹이 같은 planner를 공유할 수 없다.

### 2.3 add alarm, today도 완전한 공통 도메인이 아님

- `frontend/src/pages/AddAlarmPage.tsx:80`
- `frontend/src/pages/AddAlarmPage.tsx:94`
- `frontend/src/services/privacySync.ts:30`
- `frontend/src/services/privacySync.ts:130`

알람 draft와 app-only 일정도 로컬 저장이다. 즉 "deadline만 서버화"해도 planner 전체는 여전히 분리된 제품으로 남는다.

### 2.4 앱은 planner 도메인 탭이 없음

- `mobile-agent-android/app/src/main/res/navigation/main_nav_graph.xml:20`
- `mobile-agent-android/app/src/main/res/menu/bottom_nav_menu.xml:8`

앱은 `Home / Add Alarm / Calendar / My Page`만 있고, 마감/목표분해/오늘 배정이라는 planner 도메인을 직접 표현하지 못한다.

### 2.5 앱의 Today 화면도 planner aggregate가 아니라 로컬 alarm 저장소 중심

- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/alarm/AlarmRepository.kt:8`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/alarm/AlarmRepository.kt:25`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/calendar/CalendarOverlayFragment.kt:216`

앱 Calendar는 현재 SharedPreferences 기반 alarm 저장소를 먼저 읽는다. planner 공통 상태를 읽는 구조가 아니다.

## 3. 목표 구조

## 3.1 제품 구조

- 웹: `/planner`
- 앱: `Plan` 탭에서 동일 planner 진입
- 앱 `Calendar`: planner의 `DailyAssignment` projection을 읽는 Today 실행 화면

### 탭 구성

- `deadline`: 마감 생성, 목표 분해, 진행률, D-day, drift
- `today`: 오늘 배정, 당일 체크, carry-over, 실행 상태
- `alarm`: 알람 정책, 반복, 미션 연결, 개인정보 모드

## 3.2 공통 도메인 객체

외부 계약은 아래 5개 객체로 고정한다.

1. `Deadline`
2. `GoalItem`
3. `DailyAssignment`
4. `AlarmPolicy`
5. `ExecutionState`

실제 저장 단위는 `PlannerWorkspace` aggregate 하나로 둔다.

```ts
type PlannerWorkspace = {
  workspaceId: string;
  userId: string;
  timezone: string;
  activeDate: string;
  deadlines: Deadline[];
  goalItems: GoalItem[];
  assignments: DailyAssignment[];
  alarmPolicies: AlarmPolicy[];
  executionStates: ExecutionState[];
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
};
```

이 구조를 쓰는 이유는 다음과 같다.

- 화면은 다섯 객체를 소비하지만, 저장과 동기화는 하나의 version 축으로 관리할 수 있다.
- optimistic concurrency, idempotency, offline replay를 aggregate 단위로 처리할 수 있다.
- 기존 `DayPlan`과 `ReminderJob`을 projection으로 재사용할 수 있다.

## 4. 서버 저장 전략

## 4.1 신규 aggregate + 기존 projection 유지

기존 planner 인프라는 버리지 않는다.

- `backend/spec_loop/models/day_plan.py:10`
- `backend/spec_loop/models/day_plan.py:20`
- `backend/spec_loop/models/day_plan.py:22`
- `backend/spec_loop/models/reminder_job.py:20`
- `backend/spec_loop/models/reminder_job.py:29`
- `backend/spec_loop/models/reminder_job.py:59`

권장 구조는 다음과 같다.

- source of truth: `planner_workspaces`
- read/write projection:
  - `day_plans` -> `DailyAssignment` projection
  - `reminder_jobs` -> `AlarmPolicy` projection

즉 planner는 새 aggregate로 도입하되, 이미 운영 중인 day/reminder 축은 projection으로 살린다.

## 4.2 기존 `/plan/day-with-mission`은 adapter로 유지

기존 API는 바로 제거하지 않는다.

- `backend/spec_loop/planner/schemas.py:158`
- `backend/spec_loop/planner/schemas.py:165`
- `backend/spec_loop/planner/service.py:197`
- `backend/spec_loop/planner/service.py:205`
- `backend/spec_loop/planner/service.py:319`
- `backend/spec_loop/planner/service.py:380`

`/plan/day-with-mission`은 내부에서 `planner` aggregate mutation으로 변환한 뒤 projection을 갱신하는 adapter route로 내린다.

이유는 다음과 같다.

- 현재 웹과 앱 일부가 이미 이 축에 의존한다.
- 기능 전환 중에도 reminder scheduling과 day_id 호환성이 유지된다.
- 백필과 롤백이 쉬워진다.

## 5. 웹 구조 개편

## 5.1 route 통합

신규 route:

- `/planner`

기존 route는 최소 1개 릴리스 동안 redirect 유지:

- `/plan/day` -> `/planner?tab=today`
- `/add-alarm` -> `/planner?tab=alarm`
- `/deadline-planner` -> `/planner?tab=deadline`

이 방식은 기존 deeplink, 북마크, QA 스크립트, 광고/배포 링크를 한 번에 깨지 않기 위해 필요하다.

## 5.2 상태 훅 통합

현재 분리 상태:

- `frontend/src/hooks/usePlanWizard.ts`
- `frontend/src/hooks/useDeadlineGoals.ts`

목표 상태:

- `frontend/src/hooks/usePlanner.ts`

`usePlanner`는 단순 CRUD 훅이 아니라 planner 상태머신이어야 한다.

### 상태머신 phase

1. `draft_deadline`
2. `decompose_goal`
3. `assign_today`
4. `link_alarm`
5. `review`
6. `saved`

### 핵심 액션

- `createDeadline`
- `updateDeadline`
- `splitGoals`
- `assignGoalItemsToDate`
- `connectAlarmPolicy`
- `toggleGoalItemCompletion`
- `pullForward`
- `syncNow`
- `resolveConflict`

### 금지 사항

- 탭별로 별도 local state를 source of truth로 두지 않는다.
- `useDeadlineGoals` 스타일의 localStorage-only CRUD를 유지하지 않는다.
- `AddAlarmPage`의 draft 저장 규칙을 별도 product로 남기지 않는다.

## 5.3 로컬 캐시

웹 캐시는 `IndexedDB`로 이동한다.

로컬에 저장해야 하는 것은 데이터가 아니라 "동기화 상태"다.

```ts
type PlannerCacheRecord = {
  workspaceId: string;
  snapshot: PlannerWorkspace;
  baseVersion: number;
  pendingMutations: PlannerMutation[];
  lastSyncedAt: string | null;
  lastOpenedAt: string | null;
};
```

`localStorage`는 아래 용도로만 제한한다.

- feature flag
- last selected tab
- low-risk UI preference

## 6. 앱 구조 개편

## 6.1 탭 전략

첫 버전은 `Add Alarm` 탭을 제거하지 않고 `Plan` 탭으로 승격한다.

단, `nav_add_alarm` id는 바로 바꾸지 않는다.

이유:

- `CalendarOverlayFragment.kt:317`에서 `nav_add_alarm`로 이동한다.
- `MainActivity`와 하위 프래그먼트가 현재 bottom nav id에 기대고 있다.

즉 v1은 다음처럼 간다.

- 리소스 id 유지: `nav_add_alarm`
- 사용자 노출 라벨 변경: `Plan`
- 내부 fragment는 planner host로 교체

## 6.2 WebView host 재사용

앱은 이미 WebView host 패턴을 가지고 있다.

- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:28`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:69`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:96`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:232`

반면 `LegacyMainTabFragment`의 recovery 진입은 아직 외부 브라우저 기반이다.

- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/LegacyMainTabFragment.kt:1987`

따라서 planner v1은 다음 둘 중 하나로 구현한다.

1. `PlannerWebViewActivity` 신설
2. `RecoveryWebViewActivity`를 `CommonWebViewActivity`로 일반화

권장안은 2번이다. 보안 설정, progress, JS bridge, 내부/외부 URL 판정 로직을 이미 검증된 코드에서 재사용할 수 있기 때문이다.

## 6.3 Calendar 역할 유지

`Calendar`는 없애지 않는다. 역할을 명확히 바꾼다.

- 기존 역할: local alarm + service/google overlay
- 목표 역할: `DailyAssignment` 실행 화면 + service/google overlay

즉 planner와 calendar의 관계는 아래와 같다.

- `Plan` 탭: 생성/편집
- `Calendar` 탭: 오늘 실행/체크/빠른 수정

## 7. 오프라인과 충돌 정책

1000만 다운로드급에서는 "updatedAt, version 추가"만으로 부족하다.

필수 필드:

- `version`
- `updatedAt`
- `deletedAt`
- `baseVersion`
- `clientRequestId`
- `deviceId`
- `pendingMutationId`
- `lastSyncedAt`

### 충돌 규칙

- `GoalItem.completion`: merge 가능
- `DailyAssignment` 재배정: 사용자 선택 필요
- `AlarmPolicy`: last-write-wins + conflict banner
- `Deadline` 날짜/제목 변경: server snapshot 우선, client는 diff UI 제공

### 서버 응답 표준

```json
{
  "error": "version_conflict",
  "workspaceId": "pw_123",
  "expectedVersion": 14,
  "actualVersion": 16,
  "serverSnapshot": {},
  "mergeHint": {
    "safeAutoMergeFields": ["goalItems.completionLog"]
  }
}
```

## 8. 운영급 보강 항목

## 8.1 Feature flag

- `planner_workspace_v1_web`
- `planner_workspace_v1_android`
- `planner_workspace_projection_write`
- `planner_workspace_conflict_ui`

## 8.2 관측성

필수 이벤트:

- planner workspace open
- planner mutation queued
- planner mutation synced
- planner conflict detected
- planner conflict resolved
- planner cache restore
- planner projection write failed
- planner webview load failed

## 8.3 장애 격리

- projection 실패가 aggregate write를 막지 않도록 outbox 또는 retry queue 도입
- planner WebView kill switch 제공
- 기존 `/plan/day-with-mission` adapter route 유지
- route redirect 유지

## 8.4 보안

- WebView는 허용 도메인만 로드
- 세션 전달은 앱 저장 access token 또는 secure cookie 사용
- planner page는 `native_bridge=android` 식별자를 수용하되 권한 상승 근거로 쓰지 않음

## 9. 단계별 실행 순서

### Phase 1

- backend planner aggregate 추가
- 기존 day/reminder projection adapter 추가
- 웹 `/planner` route 추가
- 기존 3 route redirect 유지

### Phase 2

- `usePlanWizard` + `useDeadlineGoals` -> `usePlanner`
- `deadlinePlannerService` 제거
- `privacySync`의 app-only event를 planner cache로 이관

### Phase 3

- Android `Plan` 탭 승격
- planner WebView host 연결
- planner snapshot read-only 캐시 도입

### Phase 4

- Android `Calendar`를 `DailyAssignment` reader로 전환
- Room cache + sync queue 도입
- SharedPreferences alarm 저장소는 projection 캐시로만 축소

### Phase 5

- native planner 세부 UI 고도화 검토
- old route 제거
- legacy 로컬 스토리지 제거 완료

## 10. 이번 패치 기준 결정 사항

즉시 확정:

- planner는 하나의 제품으로 통합한다.
- source of truth는 서버 aggregate다.
- 웹과 앱은 동일 기능표를 공유한다.
- 앱 v1 planner는 WebView host가 우선이다.
- Calendar는 Today 실행 셸로 유지한다.

추가 결정 필요:

- `PlannerWorkspace`를 JSON aggregate로 둘지, 정규화 테이블로 둘지
- 앱 WebView host를 신규 Activity로 만들지, recovery host를 일반화할지
- planner projection write를 동기 처리할지, outbox 비동기 처리할지
