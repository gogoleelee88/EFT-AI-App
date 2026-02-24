param(
  [string]$BaseUrl = "http://127.0.0.1:8011",
  [string]$Date = "",
  [string]$UserId = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Date)) {
  $Date = (Get-Date).ToString("yyyy-MM-dd")
}

Write-Host "BASE_URL=$BaseUrl"
Write-Host "DATE=$Date"

$headers = @("Content-Type: application/json")

function CurlJson {
  param(
    [string]$Method,
    [string]$Url,
    [string]$Body = ""
  )
  if ($Body -ne "") {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
      Set-Content -Path $tmp -Value $Body -Encoding UTF8 -NoNewline
      return curl.exe -sS -X $Method $Url -H $headers[0] --data-binary "@$tmp"
    } finally {
      Remove-Item -Path $tmp -ErrorAction SilentlyContinue
    }
  }
  return curl.exe -sS -X $Method $Url
}

# 1) place create (location mission verification target)
$placePayload = @{
  name = "Spec Loop Library"
  address = "Seoul Test Address"
  gps_lat = 37.5665
  gps_lng = 126.9780
  gps_radius = 500
  verification_method = @("gps")
} | ConvertTo-Json -Compress

$placeUrl = "$BaseUrl/api/spec/places"
if ($UserId -ne "") { $placeUrl = "$placeUrl?user_id=$UserId" }
$placeRaw = CurlJson -Method "POST" -Url $placeUrl -Body $placePayload
$place = $placeRaw | ConvertFrom-Json
$placeId = $place.place_id
if (-not $placeId) { throw "place creation failed: $placeRaw" }
Write-Host "place_id=$placeId"

# 2) create day plan with missions
$planItem = @{
  task_title = "Mission security flow"
  est_minutes = 15
  priority = 1
  planned_block_minutes = 15
  micro_steps = @("step1")
  micro_action = @{
    name = "Start focus"
    description = "focus start"
    start_trigger = "alarm ring"
    source = "user_custom"
  }
  missions = @(
    @{
      type = "location"
      enabled = $true
      config = @{
        place_id = $placeId
        place_name = "Spec Loop Library"
        verification_method = @("gps")
        gps = @{
          lat = 37.5665
          lng = 126.9780
          radius = 500
        }
      }
    }
  )
  missions_combination_mode = "basic"
  alarm = @{
    time = "09:00"
    repeat = "daily"
  }
}

$planPayloadObj = @{
  date = $Date
  mode = 100
  items = @($planItem)
}
if ($UserId -ne "") { $planPayloadObj.user_id = $UserId }
$planPayload = $planPayloadObj | ConvertTo-Json -Depth 20 -Compress

$planRaw = CurlJson -Method "POST" -Url "$BaseUrl/api/spec/plan/day-with-mission" -Body $planPayload
$plan = $planRaw | ConvertFrom-Json
$dayId = $plan.day_id
if (-not $dayId) { throw "plan creation failed: $planRaw" }
Write-Host "day_id=$dayId"

# 3) mission start
$startPayloadObj = @{ day_id = $dayId }
if ($UserId -ne "") { $startPayloadObj.user_id = $UserId }
$startPayload = $startPayloadObj | ConvertTo-Json -Compress
$startRaw = CurlJson -Method "POST" -Url "$BaseUrl/api/spec/missions/start" -Body $startPayload
$start = $startRaw | ConvertFrom-Json
$missionRunId = $start.mission_run_id
if (-not $missionRunId) { throw "mission start failed: $startRaw" }
Write-Host "mission_run_id=$missionRunId"

# 4) verify location (uses mission_run_id)
$verifyUrl = "$BaseUrl/api/spec/missions/verify/location?day_id=$dayId&place_id=$placeId&current_lat=37.5665&current_lng=126.9780&mission_run_id=$missionRunId"
if ($UserId -ne "") { $verifyUrl = "$verifyUrl&user_id=$UserId" }
$verifyRaw = CurlJson -Method "POST" -Url $verifyUrl
Write-Host "verify_location=$verifyRaw"

# 5) check alarm dismissable
$checkUrl = "$BaseUrl/api/spec/missions/check-alarm?day_id=$dayId&combination_mode=basic&mission_run_id=$missionRunId"
if ($UserId -ne "") { $checkUrl = "$checkUrl&user_id=$UserId" }
$checkRaw = CurlJson -Method "POST" -Url $checkUrl
Write-Host "check_alarm=$checkRaw"

# 6) dismiss alarm
$dismissUrl = "$BaseUrl/api/spec/missions/dismiss-alarm?day_id=$dayId&mission_run_id=$missionRunId"
if ($UserId -ne "") { $dismissUrl = "$dismissUrl&user_id=$UserId" }
$dismissRaw = CurlJson -Method "POST" -Url $dismissUrl
Write-Host "dismiss_alarm=$dismissRaw"

# 7) dismiss again (expected 409)
$dismissAgainStatus = curl.exe -sS -o NUL -w "%{http_code}" -X POST $dismissUrl
Write-Host "dismiss_again_status=$dismissAgainStatus (expected 409)"

# 8) soft delete day plan
$deleteUrl = "$BaseUrl/api/spec/plan/day/$dayId"
if ($UserId -ne "") { $deleteUrl = "$deleteUrl?user_id=$UserId" }
$deleteRaw = CurlJson -Method "DELETE" -Url $deleteUrl
Write-Host "delete_plan=$deleteRaw"

# 9) get deleted day plan (expected 404)
$getDeletedStatus = curl.exe -sS -o NUL -w "%{http_code}" -X GET "$BaseUrl/api/spec/plan/day/$dayId"
Write-Host "get_deleted_status=$getDeletedStatus (expected 404)"

# 10) restore day plan
$restoreUrl = "$BaseUrl/api/spec/plan/day/$dayId/restore"
if ($UserId -ne "") { $restoreUrl = "$restoreUrl?user_id=$UserId" }
$restoreRaw = CurlJson -Method "POST" -Url $restoreUrl
Write-Host "restore_plan=$restoreRaw"

# 11) get restored day plan (expected 200)
$getRestoredStatus = curl.exe -sS -o NUL -w "%{http_code}" -X GET "$BaseUrl/api/spec/plan/day/$dayId"
Write-Host "get_restored_status=$getRestoredStatus (expected 200)"
