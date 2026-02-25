# mobile-agent-android (P0)

로컬 우선(Local-first) 안드로이드 알람 에이전트입니다. 푸시 없이도 동작합니다.

## Scope
- Exact alarm scheduling with `AlarmManager`
- Alarm trigger handling with `AlarmReceiver`
- Full-screen `AlarmActivity` + ongoing sound/vibration via `AlarmSoundService`
- 미션 게이트:
  - **장소 도착 미션**: 반경 내 도착 시에만 해제
  - **수동 끄기**: 구글 일정 등 미션 없는 알람 수동 해제
  - One-shot current location read via `FusedLocationProviderClient`
  - Alarm dismiss only when current location is inside target radius (default `80m`)
  - If outside radius, show distance in meters and keep alarm ringing
- Reboot restore with `BootReceiver`
- Optional completion event POST (best effort) to backend `/api/push/metrics`

## Key Files
- `app/src/main/java/com/eft/mobileagent/MainActivity.kt`
- `app/src/main/java/com/eft/mobileagent/alarm/AlarmScheduler.kt`
- `app/src/main/java/com/eft/mobileagent/alarm/AlarmReceiver.kt`
- `app/src/main/java/com/eft/mobileagent/alarm/AlarmActivity.kt`
- `app/src/main/java/com/eft/mobileagent/alarm/AlarmSoundService.kt`
- `app/src/main/java/com/eft/mobileagent/alarm/BootReceiver.kt`
- `app/src/main/java/com/eft/mobileagent/alarm/LocationMissionValidator.kt`

## Manifest Permissions
- `SCHEDULE_EXACT_ALARM`
- `POST_NOTIFICATIONS`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- `RECEIVE_BOOT_COMPLETED`
- `USE_FULL_SCREEN_INTENT`

## Demo Scenario
1. 앱 실행.
2. 일정 날짜(한국시간 기준)와 알람 시간 설정.
3. 소스 선택:
   - `서비스 일정` -> 기본 `장소 도착 미션`
   - `구글 일정` -> 자동 `수동 끄기`
4. 장소 도착 미션이면 `현재 위치를 목표로 저장` 후 알람 생성.
5. 알람 시각에 풀스크린 알람 + 소리/진동 유지.
6. 도착 미션:
   - 반경 내: 알람 종료
   - 반경 밖: 거리 표시, 알람 유지
7. 수동 끄기: `알람 끄기` 버튼으로 종료.

## Notes
- Emulator backend default is `http://10.0.2.2:8000`.
- `buildConfigField` in `app/build.gradle.kts` sets:
  - `BACKEND_BASE_URL`
  - `COMPLETION_EVENT_PATH`
- Before build, create `local.properties` from `local.properties.example` and set `sdk.dir`.

## Behavior Agent v1 (new)
- Checklist: `mobile-agent-android/docs/BEHAVIOR_AGENT_V1_CHECKLIST.md`
- Core files:
  - `app/src/main/java/com/eft/mobileagent/behavior/BehaviorAgentService.kt`
  - `app/src/main/java/com/eft/mobileagent/behavior/HarL0TfliteClassifier.kt`
  - `app/src/main/java/com/eft/mobileagent/behavior/BehaviorL1Mapper.kt`
  - `app/src/main/java/com/eft/mobileagent/behavior/BehaviorTfliteClassifier.kt`
  - `app/src/main/java/com/eft/mobileagent/behavior/BehaviorQueueRepository.kt`
  - `app/src/main/java/com/eft/mobileagent/behavior/BehaviorApiClient.kt`
  - `app/src/main/java/com/eft/mobileagent/behavior/BehaviorModels.kt`
  - `app/src/main/assets/behavior/README.md`
  - `app/src/main/assets/behavior/l0_labels.txt`
  - `app/src/main/assets/behavior/l1_labels.txt`
- Start/stop from app code:
  - `BehaviorAgentController.start(context)`
  - `BehaviorAgentController.stop(context)`
  - `BehaviorAgentController.flush(context)`
- Main screen fields:
  - backend URL + user id (required)
  - behavior access token (optional; stored as `behavior_access_token`)
  - behavior question panel (refresh/answer/dismiss)
- Inference behavior:
  - if `assets/behavior/behavior_l1.tflite` exists, direct L1 TFLite inference is used
  - if L1 model is missing but `assets/behavior/har_l0.tflite` exists, app runs L0 HAR model then maps to L1 on-device
  - label order is read from `assets/behavior/l1_labels.txt` or `assets/behavior/l0_labels.txt`
  - if both models are missing, service falls back to heuristic inference automatically

## Reminder Auto Sync (WorkManager)
- After entering `backend base URL + user_id` and pressing `웹 일정 알람 가져오기`, the app stores sync config.
- A periodic worker runs every 15 minutes (network connected) and pulls `/api/reminders/mobile-sync`.
- On device reboot/app update, `BootReceiver` restores alarms and re-registers periodic sync.

## Mobile Login (simple)
- Input `아이디 또는 이메일` and press `로그인`.
- App calls backend `/api/reminders/mobile-login` and resolves canonical `user_id`.
- On success, app stores sync config, triggers immediate sync once, and keeps periodic sync enabled.
