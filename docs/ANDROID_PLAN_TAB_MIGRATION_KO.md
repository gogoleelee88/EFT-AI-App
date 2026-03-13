# Android Plan 탭 구조 변경안

## 1. 목표

앱에서 planner 기능을 별도 네이티브로 중복 구현하지 않고, 동일 planner 제품을 앱 셸에서 연다.

첫 버전 목표:

- `Add Alarm` 탭을 `Plan` 탭으로 승격
- planner는 WebView host로 연다
- `Calendar`는 Today 실행 셸로 유지
- planner 데이터는 서버 snapshot과 공통 캐시에서 읽는다

## 2. 현재 구조

### 네비게이션

- `mobile-agent-android/app/src/main/res/navigation/main_nav_graph.xml:20`
- `mobile-agent-android/app/src/main/res/menu/bottom_nav_menu.xml:8`

현재 탭:

- Home
- Add Alarm
- Calendar
- My Page

### 현재 탭 구현

- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/AddAlarmTabFragment.kt:3`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/LegacyMainTabFragment.kt:152`

`Add Alarm` 탭은 planner 도메인이 아니라 레거시 alarm 입력 폼 셸이다.

### 현재 Today 소스

- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/calendar/CalendarOverlayFragment.kt:216`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/alarm/AlarmRepository.kt:8`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/alarm/AlarmRepository.kt:134`

Calendar는 SharedPreferences 기반 `AlarmRepository`에서 active alarm을 읽는다.

### 현재 WebView 기반 host

- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:28`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:69`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:96`
- `mobile-agent-android/app/src/main/java/com/eft/mobileagent/recovery/RecoveryWebViewActivity.kt:232`

앱은 이미 보안 설정이 있는 WebView activity를 가지고 있다.

## 3. 변경 원칙

- 첫 버전은 탭 id를 바꾸지 않는다.
- 사용자 노출 라벨만 `Plan`으로 바꾼다.
- 기존 `Calendar -> Add Alarm` 이동도 내부적으로는 같은 tab id를 사용한다.
- planner 도메인 데이터는 Room 캐시로 수렴한다.
- SharedPreferences alarm 저장소는 projection 캐시 또는 fallback으로만 남긴다.

## 4. v1 변경안

## 4.1 탭 라벨 변경

변경 대상:

- `bottom_nav_menu.xml`
- `main_nav_graph.xml`

규칙:

- `android:id="@+id/nav_add_alarm"` 유지
- `android:title="Plan"` 변경
- `android:label="Plan"` 변경

이유:

- `CalendarOverlayFragment.kt:317`가 현재 `nav_add_alarm`를 직접 선택한다.
- route id를 바꾸면 연쇄 수정 범위가 커지고 리스크가 높다.

## 4.2 fragment 교체

현재:

- `AddAlarmTabFragment : LegacyMainTabFragment`

목표:

- `PlannerTabFragment`

v1에서는 두 가지 선택지가 있다.

### 선택지 A

`AddAlarmTabFragment` 클래스는 유지하고 내부 레이아웃만 planner launcher로 축소

장점:

- 리소스 충돌이 적다
- calendar navigation 수정이 거의 없다

단점:

- 이름이 실제 역할과 안 맞는다

### 선택지 B

`PlannerTabFragment` 신설 후 nav id는 유지

장점:

- 코드 의미가 명확하다

단점:

- nav graph, fragment 교체, 일부 테스트 보정이 필요하다

권장안은 B다. 다만 id는 그대로 둔다.

## 4.3 WebView host 재사용

현재 recovery host는 planner host의 기반으로 재사용 가능하다.

필요 작업:

1. `RecoveryWebViewActivity`를 `CommonWebViewActivity`로 일반화
2. `title`, `allowedHost`, `startUrl`, `bridgeName`, `exitConfirmMessage`를 intent extra로 받음
3. recovery는 기존 옵션으로 그대로 사용
4. planner는 `/planner?shell=android&tab=deadline|today|alarm` URL로 사용

최소 요구 사항:

- JS enabled
- dom storage enabled
- host allowlist
- progress bar
- load fail UI
- external URL 분리
- optional JS bridge

현재 코드가 이미 대부분 제공한다.

## 4.4 planner launcher 흐름

`Plan` 탭에서 해야 할 일:

1. backend base URL 확인
2. access token 또는 secure session 확인
3. planner URL 구성
4. WebView host open

예시 URL:

```text
https://app.example.com/planner?shell=android&tab=deadline&native_bridge=android
```

권장 query:

- `shell=android`
- `tab=deadline`
- `native_bridge=android`
- `source=mobile_tab`

주의:

- 이 query는 UI 힌트일 뿐 권한 근거가 아니다.
- 인증은 쿠키 또는 access token으로만 처리한다.

## 5. Calendar 변경안

## 5.1 역할 재정의

기존 `Calendar`는 다음을 수행한다.

- 로컬 alarm 조회
- service plan item 조회
- Google 일정 조회

목표 `Calendar`는 다음을 수행한다.

- planner `DailyAssignment` 조회
- `ExecutionState` 기반 완료/미완료 표시
- Google 일정 overlay
- 빠른 수정 진입점 제공

## 5.2 데이터 소스 우선순위

v1:

1. planner today projection API
2. Room cache
3. legacy `AlarmRepository` fallback

v2:

1. planner today projection API
2. Room cache
3. no legacy fallback

## 5.3 CTA 변경

현재 empty CTA:

- `CalendarOverlayFragment.kt:82`
- `CalendarOverlayFragment.kt:317`

현재는 `navigateToAddAlarm()`로 연결된다. v1에서는 메서드 이름은 유지해도 되지만 사용자 문구와 intent는 `Plan` 탭 기준으로 바꿔야 한다.

권장:

- 메서드명은 나중에 `navigateToPlan()`으로 리팩터링
- 우선 동작은 동일 nav id 유지

## 6. 로컬 저장소 전환

## 6.1 현재 문제

`AlarmRepository`는 SharedPreferences JSON 저장소다.

- `AlarmRepository.kt:73`
- `AlarmRepository.kt:108`

이 구조는 planner aggregate와 동시성, 부분 sync, 충돌 해결을 다루기 어렵다.

## 6.2 목표

Room table 예시:

- `planner_workspace_cache`
- `planner_assignment_cache`
- `planner_alarm_policy_cache`
- `planner_pending_mutation`

예시 entity:

```kotlin
@Entity(tableName = "planner_assignment_cache")
data class PlannerAssignmentEntity(
    @PrimaryKey val assignmentId: String,
    val date: String,
    val payloadJson: String,
    val version: Int,
    val updatedAt: String
)
```

## 6.3 pending mutation queue

```kotlin
@Entity(tableName = "planner_pending_mutation")
data class PlannerPendingMutationEntity(
    @PrimaryKey val mutationId: String,
    val workspaceId: String,
    val baseVersion: Int,
    val mutationType: String,
    val payloadJson: String,
    val status: String,
    val createdAt: String
)
```

## 7. Android 단계별 롤아웃

## Phase 1

- 탭 라벨 `Add Alarm -> Plan`
- planner WebView launcher 연결
- recovery WebView host 일반화 또는 재사용

## Phase 2

- planner snapshot read-only cache 도입
- planner today projection API 연결
- Calendar에서 planner projection 우선 사용

## Phase 3

- Room cache + pending mutation queue
- planner quick action 추가
- goal item complete/undo를 앱에서 직접 수행

## Phase 4

- planner native 컴포넌트 일부 대체 검토
- 자주 쓰는 액션만 native로 승격
- 전체 planner를 네이티브로 복제하지 않음

## 8. 테스트 기준

필수 QA:

- 탭 라벨 변경 후 navigation regression 없음
- planner WebView 인증 실패 시 오류 UI 정상
- planner host에서 외부 링크는 외부 브라우저로 분리
- 앱 재시작 후 마지막 planner 진입 정상
- Calendar가 planner today projection을 읽으면 동일 assignment가 보임
- planner에서 수정한 alarm policy가 reminder sync와 일치

## 9. 리스크와 대응

### 리스크 1

WebView에서 인증 세션이 불안정할 수 있음

대응:

- access token 명시 주입 또는 secure cookie 공유
- session refresh 실패 시 재로그인 CTA 제공

### 리스크 2

기존 `Add Alarm` 사용자 흐름이 깨질 수 있음

대응:

- v1에서는 tab id 유지
- planner 기본 탭을 `alarm`으로 열어 전환 충격 완화

### 리스크 3

Calendar가 legacy alarm과 planner projection을 동시에 보여 중복될 수 있음

대응:

- `taskUid + date + sourceType` 기준 dedupe
- planner projection이 있으면 legacy local alarm은 lower priority 처리

## 10. 바로 구현할 Android 첫 PR 범위

1. `bottom_nav_menu.xml` 라벨을 `Plan`으로 변경
2. `main_nav_graph.xml` 라벨을 `Plan`으로 변경
3. planner WebView host activity 또는 common host 추가
4. `nav_add_alarm` fragment를 planner launcher fragment로 교체
5. `CalendarOverlayFragment` CTA 문구를 `Plan` 기준으로 수정

이 범위가 가장 안전한 이유는 사용자 노출 변화는 즉시 만들면서도, backend aggregate와 sync 설계가 완료되기 전까지 네이티브 중복 구현을 피할 수 있기 때문이다.
