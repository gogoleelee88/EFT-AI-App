# 미션 장소 선택/저장/표시/동기화 현재 구조 맵

기준: 코드베이스 현재 상태 역추적 (변경/리팩토링 제안 없음)

## 1) 장소 선택 UI 후보 파일 (우선순위)

| 우선순위 | 파일 | 근거 |
|---|---|---|
| 1 | `frontend/src/components/plan/MissionLocationConfig.tsx` | 장소 선택, skip, `LocationMissionConfig` 생성의 중심 UI |
| 2 | `frontend/src/components/plan/PlaceRegistrationForm.tsx` | 새 장소 등록 폼(GPS/Wi-Fi/Beacon)과 저장 트리거 |
| 3 | `frontend/src/components/plan/MissionSettingStep.tsx` | “미션2: 장소 인증” 토글/설정 진입 |
| 4 | `frontend/src/pages/PlanDayPage.tsx` | 위저드 오케스트레이션, 저장/동기화 실행 |
| 5 | `frontend/src/hooks/usePlanWizard.ts` | 미션/알람 포함 최종 저장 payload 직렬화 |
| 6 | `frontend/src/services/missionService.ts` | `/api/spec/places`, `/api/spec/plan/day-with-mission` 호출 |
| 7 | `frontend/src/types/mission.ts` | `Place`, `LocationMissionConfig` 타입 원본 |
| 8 | `frontend/src/components/plan/PlanSummary.tsx` | 저장 후 장소 미션 표시 |
| 9 | `frontend/src/components/alarm/LocationCheckForm.tsx` | 실행 시 위치 검증 API 호출 |
| 10 | `frontend/src/components/alarm/AlarmOverlay.tsx` | 검증 결과 기반 알람 해제 체크/처리 |
| 11 | `frontend/src/hooks/useGoogleCalendar.ts` | Google 내보내기 payload 생성 |
| 12 | `frontend/src/services/privacySync.ts` | MASKED 설명/키 생성 |

## (A) 파일 목록 + 역할

| 레이어 | 파일 | 역할 |
|---|---|---|
| FE Entry | `frontend/src/pages/PlanDayPage.tsx` | Step 1~5 흐름 제어, 저장/Google 동기화 실행 |
| FE Mission UI | `frontend/src/components/plan/MissionSettingStep.tsx` | 미션 타입별 config 반영 |
| FE Place UI | `frontend/src/components/plan/MissionLocationConfig.tsx` | Place 목록 로드, 선택값을 `LocationMissionConfig`로 변환 |
| FE Place 등록 UI | `frontend/src/components/plan/PlaceRegistrationForm.tsx` | 신규 Place 등록 payload 구성 |
| FE State | `frontend/src/hooks/usePlanWizard.ts` | missions/alarm 포함 계획 저장 요청 생성 |
| FE API | `frontend/src/services/missionService.ts` | Mission/Place/Plan 관련 API 호출 |
| FE Verify UI | `frontend/src/components/alarm/LocationCheckForm.tsx` | `/api/spec/missions/verify/location` 호출 |
| FE Alarm | `frontend/src/components/alarm/AlarmOverlay.tsx` | `/check-alarm`, `/dismiss-alarm` 호출 |
| FE Google | `frontend/src/hooks/useGoogleCalendar.ts` | `/api/spec/plan/day/export`, `/api/spec/google/events` |
| FE Privacy | `frontend/src/services/privacySync.ts` | MASKED title/description 생성 및 키 매핑 |
| BE Mount | `backend/main.py` | planner/google/mission/verify 라우터 등록 |
| BE Place Router | `backend/spec_loop/mission/router.py` | `/api/spec/places` CRUD |
| BE Place Service | `backend/spec_loop/mission/service.py` | Place DB 저장/조회 |
| BE Plan Router | `backend/spec_loop/planner/router.py` | `/api/spec/plan/day-with-mission` |
| BE Plan Service | `backend/spec_loop/planner/service.py` | DayPlan items JSON + MicroAction + MissionTemplate 저장 |
| BE Verify Router | `backend/spec_loop/mission/verify_router.py` | 위치 검증 + MissionResult 저장 |
| BE Verify Logic | `backend/services/location_service.py` | GPS/Wi-Fi/Bluetooth 판정 |
| BE Alarm Service | `backend/services/alarm_service.py` | 알람 해제 판정/성공률 반영 |
| BE Google Router | `backend/spec_loop/google_calendar/router.py` | export/update/status/events |
| BE Google Sync | `backend/spec_loop/google_calendar/sync.py` | Google API request body 구성 |
| DB 등록 | `backend/database.py`, `backend/spec_loop/models/__init__.py` | 모델 import 등록 |

## (B) 데이터 구조 (현재 location 관련 필드)

| 계층 | 구조 | 필드 |
|---|---|---|
| FE 타입 | `LocationMissionConfig` (`frontend/src/types/mission.ts`) | `place_id`, `place_name`, `address`, `gps{lat,lng,radius}`, `wifi_ssid`, `bluetooth_beacon_id`, `verification_method[]` |
| FE 타입 | `Place` (`frontend/src/types/mission.ts`) | `place_id`, `name`, `address`, `gps_lat`, `gps_lng`, `gps_radius`, `wifi_ssid`, `bluetooth_beacon_id`, `verification_method`, 성공률 필드 |
| FE 요청 | `PlaceCreateRequest` (`frontend/src/types/mission.ts`) | `name`, `address`, `gps_lat`, `gps_lng`, `gps_radius`, `wifi_ssid`, `bluetooth_beacon_id`, `verification_method[]` |
| BE 스키마 | `PlaceCreate/PlaceUpdate/PlaceResponse` (`backend/spec_loop/mission/schemas.py`) | FE 구조와 동일 의미, 검증 제약 포함 |
| DB 테이블 | `places` (`backend/spec_loop/models/place.py`) | 장소 기본 정보 + 인증수단 + 성공률 통계 |
| DB 테이블 | `mission_templates.config` (`backend/spec_loop/models/mission.py`) | location config JSON 스냅샷 |
| DB 테이블 | `day_plans.items` (`backend/spec_loop/models/day_plan.py`) | `items[].missions[].config`에 location 저장 |
| DB 테이블 | `mission_results.evidence` (`backend/spec_loop/models/mission_result.py`) | `place_id`, `place_name`, `gps(distance)`, `wifi_matched`, `bluetooth_matched` |

## (C) 시퀀스 다이어그램 (텍스트)

### C-1. 장소 등록/선택/계획 저장

```text
User
 -> MissionSettingStep(장소 설정 열기)
 -> MissionLocationConfig.loadPlaces()
 -> missionService.getPlaces()
 -> GET /api/spec/places
 -> mission.router.list_places()
 -> mission.service.get_user_places()
 -> DB places 조회

(신규 등록)
User -> PlaceRegistrationForm.handleSave()
 -> missionService.createPlace()
 -> POST /api/spec/places
 -> mission.router.create_place()
 -> mission.service.create_place()
 -> DB places INSERT

(선택 저장)
MissionLocationConfig.handleSave()
 -> onSave(LocationMissionConfig)
 -> MissionSettingStep.updateMissionConfig("location")
 -> PlanDayPage step4 onComplete()
 -> usePlanWizard.submit()
 -> POST /api/spec/plan/day-with-mission
 -> planner.router.post_plan_day_with_mission()
 -> planner.service.create_or_update_day_plan_with_mission()
 -> mission.service.get_or_create_micro_action()
 -> mission.service.create_mission_template()
 -> DB micro_actions / mission_templates / day_plans.items 저장
```

### C-2. 실행 시 위치 검증/알람 해제

```text
User
 -> LocationCheckForm.handleCheckLocation()
 -> getCurrentPosition() (브라우저 geolocation)
 -> POST /api/spec/missions/verify/location
 -> verify_router.verify_location()
 -> services.location_service.verify_location_mission()
 -> DB mission_results INSERT

User -> AlarmOverlay.handleCheckDismissal()
 -> POST /api/spec/missions/check-alarm
 -> alarm_service.check_alarm_dismissal()
 -> (통과 시) POST /api/spec/missions/dismiss-alarm
 -> alarm_service.dismiss_alarm_and_update_stats()
 -> DB places.success_count/total_count 반영
```

### C-3. Google Calendar 동기화

```text
PlanDayPage.handleExportToGoogle()
 -> summary/description 생성
 -> useGoogleCalendar.exportToGoogle()
 -> POST /api/spec/plan/day/export
 -> google.router.export_task_to_google()
 -> sync.create_google_event()
 -> Google events.insert(body={summary,start,end})
 -> DB google_event_mappings 저장
```

## 4) Google Calendar 동기화에서 location/description 실제 반영 상태

| 항목 | 위치 | 현재 상태 |
|---|---|---|
| 프론트 payload 생성 | `frontend/src/pages/PlanDayPage.tsx`, `frontend/src/hooks/useGoogleCalendar.ts` | `summary`, `description`, `privacy_mode`, `privacy_key` 포함 전송 |
| 백엔드 export 요청 스키마 | `backend/spec_loop/google_calendar/router.py` | `task_id`, `start`, `duration_minutes`, `calendar_id`, `summary`만 정의 |
| Google 이벤트 생성 body | `backend/spec_loop/google_calendar/sync.py` | `summary`, `start`, `end`만 사용 |
| `description` 반영 | 전체 경로 | FE에는 있으나 BE/Google insert body에서 미사용 |
| `location` 반영 | 전체 경로 | location 필드 사용 코드 없음 |

## (D) 변경 시 영향 범위 (간단)

- `Place` 필드명/형 변경 시 FE 폼, FE mission config 변환, BE schemas/model/service 모두 영향.
- `verification_method` enum 변경 시 FE 표시/전송, BE location 검증 로직, 결과 evidence 저장 동시 영향.
- `day_plans.items[].missions[].config` 구조 변경 시 PlanSummary/재진입/검증 연계 깨질 수 있음.
- `mission_results.evidence.place_id` 구조 변경 시 알람 해제 후 Place 성공률 집계(`alarm_service`) 영향.
- Google export 계약 변경 시 FE hook body와 BE `ExportRequest`/`sync`를 함께 맞춰야 함.

