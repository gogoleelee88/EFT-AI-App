package com.eft.mobileagent

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.DatePicker
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.TimePicker
import android.widget.Toast
import android.view.View
import android.view.ViewGroup
import com.google.android.material.bottomsheet.BottomSheetDialog
import android.view.LayoutInflater
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.eft.mobileagent.alarm.AlarmJob
import com.eft.mobileagent.alarm.AlarmMissionType
import com.eft.mobileagent.alarm.AlarmRepository
import com.eft.mobileagent.alarm.AlarmScheduler
import com.eft.mobileagent.alarm.AlarmSourceType
import com.eft.mobileagent.alarm.AlarmSoundService
import com.eft.mobileagent.alarm.ReminderSyncManager
import com.eft.mobileagent.alarm.ReminderSyncClient
import com.eft.mobileagent.alarm.ReminderSyncWorkScheduler
import com.eft.mobileagent.alarm.TargetLocation
import com.eft.mobileagent.behavior.BehaviorApiClient
import com.eft.mobileagent.behavior.BehaviorAgentController
import com.eft.mobileagent.behavior.BehaviorAgentConfigStore
import com.eft.mobileagent.behavior.BehaviorQueueRepository
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.text.SimpleDateFormat
import java.net.URLEncoder
import java.net.URL
import java.net.HttpURLConnection
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.regex.Pattern

abstract class LegacyMainTabFragment : Fragment() {
    protected abstract val tabMode: MainTab
    protected abstract val tabLayoutRes: Int

    private lateinit var repository: AlarmRepository
    private lateinit var scheduler: AlarmScheduler
    private lateinit var behaviorQueueRepository: BehaviorQueueRepository
    private lateinit var behaviorConfigStore: BehaviorAgentConfigStore

    private lateinit var datePicker: DatePicker
    private lateinit var timePicker: TimePicker
    private lateinit var backendBaseUrlInput: EditText
    private lateinit var syncUserIdInput: EditText
    private lateinit var behaviorAccessTokenInput: EditText
    private lateinit var loginSyncUserButton: Button
    private lateinit var scanPairingQrButton: Button
    private lateinit var logoutSyncUserButton: Button
    private lateinit var loginFormContainer: LinearLayout
    private lateinit var editLoginButton: Button
    private lateinit var loggedInUserStatusView: TextView
    private lateinit var syncServerAlarmsButton: Button
    private lateinit var behaviorStartButton: Button
    private lateinit var behaviorStopButton: Button
    private lateinit var behaviorFlushButton: Button
    private lateinit var behaviorStatusView: TextView
    private lateinit var recoveryTimerSection: View
    private lateinit var recoverySensitivityGroup: RadioGroup
    private lateinit var recoverySensitivitySensitive: RadioButton
    private lateinit var recoverySensitivityNormal: RadioButton
    private lateinit var recoverySensitivityRelaxed: RadioButton
    private lateinit var scheduleStartDelayMinInput: EditText
    private lateinit var progressBlockedMinInput: EditText
    private lateinit var usageAccessSection: View
    private lateinit var usageStatsEnabledSwitch: com.google.android.material.switchmaterial.SwitchMaterial
    private lateinit var openUsageAccessSettingsButton: Button
    private lateinit var viewDataPolicyButton: Button
    private lateinit var usageAccessStatusText: TextView
    private lateinit var behaviorRefreshQuestionButton: Button
    private lateinit var behaviorQuestionTextView: TextView
    private lateinit var behaviorAnswerWorkButton: Button
    private lateinit var behaviorAnswerRestButton: Button
    private lateinit var behaviorAnswerMoveButton: Button
    private lateinit var behaviorAnswerExerciseButton: Button
    private lateinit var behaviorAnswerOtherButton: Button
    private lateinit var behaviorDismissQuestionButton: Button
    private lateinit var appVersionInfoText: TextView
    private lateinit var developerModeHintText: TextView
    private lateinit var alarmLabelInput: EditText

    private lateinit var sourceTypeGroup: RadioGroup
    private lateinit var sourceServiceRadio: RadioButton
    private lateinit var sourceGoogleRadio: RadioButton
    private lateinit var missionTypeGroup: RadioGroup
    private lateinit var missionLocationRadio: RadioButton
    private lateinit var missionPhotoRadio: RadioButton
    private lateinit var missionManualRadio: RadioButton
    private lateinit var locationSectionContainer: View
    private lateinit var targetLocationView: TextView
    private lateinit var alarmSummaryView: TextView

    private var waitingSaveTargetAfterPermission = false
    private var sourceChangedByUser = false
    private var behaviorQuestionPollingActive = false
    private var behaviorQuestionPollRunnable: Runnable? = null
    private var isDeveloperModeEnabled = false
    private var developerModeTapCount = 0
    private var developerModeTapStartAt = 0L
    private var behaviorQuestionSheet: BottomSheetDialog? = null
    private var behaviorQuestionSheetView: View? = null
    private val pairingCodeRegex: Pattern = Pattern.compile("(\\d{6})")

    protected enum class MainTab {
        HOME,
        ADD_ALARM,
        MY_PAGE,
    }
    private val behaviorQuestionPollHandler = Handler(Looper.getMainLooper())
    private val koreaZoneId: ZoneId = ZoneId.of("Asia/Seoul")

    private data class BehaviorStartInputs(
        val baseUrl: String,
        val userId: String,
        val accessToken: String?,
    )

    private data class BehaviorQuestionUi(
        val questionId: Int,
        val questionText: String,
        val triggerReasons: List<String>,
        val isSoftNudge: Boolean,
        val recoveryUrl: String?,
    )

    private data class RecoveryInterventionUi(
        val action: String,
        val recoveryUrl: String?,
        val entrySentence: String?,
    )

    private data class RecoveryTimerConfig(
        val sensitivity: String,
        val scheduleStartDelayMinutes: Int,
        val progressBlockedMinutes: Int,
    )

    private var currentBehaviorQuestion: BehaviorQuestionUi? = null
    private var behaviorQuestionBusy: Boolean = false
    private var lastLifecycleRecoveryEventAt = 0L
    private var activeFocusSessionId: String? = null
    private var focusSessionStartedAt = 0L
    private var usageAccessDialogShowing: Boolean = false
    private var hasMeaningfulProgress = false
    private var lastMeaningfulProgressAt = 0L
    private var scheduleStartEventSent = false
    private var lastProgressBlockedEventAt = 0L
    private var activeScheduleName: String? = null
    private var usageTracker: com.eft.mobileagent.behavior.usage.UsageSessionTracker? = null
    private var usagePoller: com.eft.mobileagent.behavior.usage.UsageStatsPoller? = null
    private val recoveryTimerHandler = Handler(Looper.getMainLooper())
    private var recoveryTimerRunnable: Runnable? = null
    private var recoveryTimerConfig = RecoveryTimerConfig(
        sensitivity = "normal",
        scheduleStartDelayMinutes = 3,
        progressBlockedMinutes = 8,
    )
    private var lastRealtimeDistractionPromptAt = 0L
    private var snoozeRealtimeUntilAt = 0L
    private var realtimePromptShowing = false

    private companion object {
        const val SOFT_NUDGE_TRIGGER_REASON = "focus_soft_nudge"
        const val SOFT_NUDGE_QUESTION_TEXT = "�ڸ����� �̵��ϼ̾��. �������Ű���?"
        const val RECOVERY_PAGE_PATH = "/eft-strict"
        const val RECOVERY_EVENT_PATH = "/api/spec/recovery/events"
        const val LIFECYCLE_RECOVERY_DEBOUNCE_MS = 60_000L
        const val RECOVERY_TIMER_TICK_MS = 60_000L
        const val PROGRESS_BLOCKED_REPEAT_MS = 10 * 60_000L
        const val SOFT_NUDGE_POLL_INTERVAL_MS = 7_000L
        val RECOVERY_WEB_PORT_CANDIDATES = listOf("8787", "4173", "5173", "80", "443")
        const val PREFS_NAME = "mobile_agent_prefs"
        const val PREF_KEY_NOTIFICATION_PROMPTED = "notification_prompted"
        const val PREF_KEY_DEVELOPER_MODE = "developer_mode_enabled"
        const val PREF_KEY_RECOVERY_SENSITIVITY = "recovery_sensitivity"
        const val PREF_KEY_SCHEDULE_START_DELAY_MIN = "schedule_start_delay_min"
        const val PREF_KEY_PROGRESS_BLOCKED_MIN = "progress_blocked_min"
        const val PREF_KEY_USAGE_STATS_ENABLED = "usage_stats_enabled"
        const val PREF_KEY_USAGE_ACCESS_PROMPTED = "usage_access_prompted"
        const val DEV_MODE_TAP_TARGET = 5
        const val DEV_MODE_TAP_WINDOW_MS = 2_500L
        const val REALTIME_WINDOW_MS = 90_000L
        const val REALTIME_MIN_EXTERNAL_SECONDS = 45
        const val REALTIME_PROMPT_COOLDOWN_MS = 5 * 60_000L
        const val REALTIME_SNOOZE_MS = 5 * 60_000L
    }

    private val requestLocationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (granted && waitingSaveTargetAfterPermission) {
                waitingSaveTargetAfterPermission = false
                saveCurrentLocationAsTarget()
            } else if (waitingSaveTargetAfterPermission) {
                waitingSaveTargetAfterPermission = false
                toast(getString(R.string.msg_location_permission_required))
            }
        }

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            handleNotificationPermissionResult(granted)
        }

    private val requestCameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                launchQrScanner()
            } else {
                toast("Camera permission is required to scan QR.")
            }
        }

    private val scanPairingQrLauncher =
        registerForActivityResult(ScanContract()) { result ->
            val raw = result.contents
            if (raw.isNullOrBlank()) {
                Log.w("QR_LOGIN", "Scanner returned empty payload (cancelled or decode failed)")
                return@registerForActivityResult
            }
            val code = parsePairingCode(raw)
            if (code == null) {
                Log.w("QR_LOGIN", "Invalid pairing QR payload: len=${raw.length}")
                toast(getString(R.string.msg_pairing_invalid_qr))
                return@registerForActivityResult
            }
            Log.d("QR_LOGIN", "Pairing code parsed: $code")
            syncUserIdInput.setText(code)
            claimPairingAndLogin(code)
        }

    private fun parsePairingCode(raw: String): String? {
        val s = raw.trim()
        if (s.isEmpty()) return null

        // 1) Fast path: exact 6 digits
        if (s.length == 6 && s.all { it.isDigit() }) return s

        // 2) Normalize and try common prefix
        val upper = s.uppercase(Locale.US)
        val idx = upper.indexOf("EFTAI_PAIR:")
        if (idx >= 0) {
            val tail = upper.substring(idx + "EFTAI_PAIR:".length).trim()
            val m = pairingCodeRegex.matcher(tail)
            if (m.find()) return m.group(1)
        }

        // 3) Fallback: find any 6-digit sequence in the whole payload
        val m = pairingCodeRegex.matcher(s)
        if (m.find()) return m.group(1)

        return null
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            requireContext(),
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startQrScan() {
        if (!hasCameraPermission()) {
            requestCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            return
        }
        launchQrScanner()
    }

    private fun launchQrScanner() {
        try {
            val options = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("웹에서 표시된 QR을 스캔해 계정을 연결하세요")
                setBeepEnabled(true)
                setOrientationLocked(true)
                setCameraId(0)
            }
            Log.d("QR_LOGIN", "Launching QR scanner")
            scanPairingQrLauncher.launch(options)
        } catch (t: Throwable) {
            Log.e("QR_LOGIN", "Failed to launch QR scanner", t)
            toast("Failed to start QR scanner.")
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View {
        return inflater.inflate(tabLayoutRes, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        repository = AlarmRepository(requireContext())
        scheduler = AlarmScheduler(requireContext())
        behaviorQueueRepository = BehaviorQueueRepository(requireContext())
        behaviorConfigStore = BehaviorAgentConfigStore(requireContext())

        datePicker = view.findViewById(R.id.datePicker)
        timePicker = view.findViewById(R.id.timePicker)
        timePicker.setIs24HourView(true)
        backendBaseUrlInput = view.findViewById(R.id.backendBaseUrlInput)
        syncUserIdInput = view.findViewById(R.id.syncUserIdInput)
        behaviorAccessTokenInput = view.findViewById(R.id.behaviorAccessTokenInput)
        loginSyncUserButton = view.findViewById(R.id.loginSyncUserButton)
        scanPairingQrButton = view.findViewById(R.id.scanPairingQrButton)
        logoutSyncUserButton = view.findViewById(R.id.logoutSyncUserButton)
        loginFormContainer = view.findViewById(R.id.loginFormContainer)
        editLoginButton = view.findViewById(R.id.editLoginButton)
        loggedInUserStatusView = view.findViewById(R.id.loggedInUserStatusView)
        syncServerAlarmsButton = view.findViewById(R.id.syncServerAlarmsButton)
        behaviorStartButton = view.findViewById(R.id.behaviorStartButton)
        behaviorStopButton = view.findViewById(R.id.behaviorStopButton)
        behaviorFlushButton = view.findViewById(R.id.behaviorFlushButton)
        behaviorStatusView = view.findViewById(R.id.behaviorStatusView)
        recoveryTimerSection = view.findViewById(R.id.recoveryTimerSection)
        recoverySensitivityGroup = view.findViewById(R.id.recoverySensitivityGroup)
        recoverySensitivitySensitive = view.findViewById(R.id.recoverySensitivitySensitive)
        recoverySensitivityNormal = view.findViewById(R.id.recoverySensitivityNormal)
        recoverySensitivityRelaxed = view.findViewById(R.id.recoverySensitivityRelaxed)
        scheduleStartDelayMinInput = view.findViewById(R.id.scheduleStartDelayMinInput)
        progressBlockedMinInput = view.findViewById(R.id.progressBlockedMinInput)
        usageAccessSection = view.findViewById(R.id.usageAccessSection)
        usageStatsEnabledSwitch = view.findViewById(R.id.usageStatsEnabledSwitch)
        openUsageAccessSettingsButton = view.findViewById(R.id.openUsageAccessSettingsButton)
        viewDataPolicyButton = view.findViewById(R.id.viewDataPolicyButton)
        usageAccessStatusText = view.findViewById(R.id.usageAccessStatusText)
        behaviorRefreshQuestionButton = view.findViewById(R.id.behaviorRefreshQuestionButton)
        behaviorQuestionTextView = view.findViewById(R.id.behaviorQuestionTextView)
        behaviorAnswerWorkButton = view.findViewById(R.id.behaviorAnswerWorkButton)
        behaviorAnswerRestButton = view.findViewById(R.id.behaviorAnswerRestButton)
        behaviorAnswerMoveButton = view.findViewById(R.id.behaviorAnswerMoveButton)
        behaviorAnswerExerciseButton = view.findViewById(R.id.behaviorAnswerExerciseButton)
        behaviorAnswerOtherButton = view.findViewById(R.id.behaviorAnswerOtherButton)
        behaviorDismissQuestionButton = view.findViewById(R.id.behaviorDismissQuestionButton)
        appVersionInfoText = view.findViewById(R.id.appVersionInfoText)
        developerModeHintText = view.findViewById(R.id.developerModeHintText)

        alarmLabelInput = view.findViewById(R.id.alarmLabelInput)
        sourceTypeGroup = view.findViewById(R.id.sourceTypeGroup)
        sourceServiceRadio = view.findViewById(R.id.sourceServiceRadio)
        sourceGoogleRadio = view.findViewById(R.id.sourceGoogleRadio)
        missionTypeGroup = view.findViewById(R.id.missionTypeGroup)
        missionLocationRadio = view.findViewById(R.id.missionLocationRadio)
        missionPhotoRadio = view.findViewById(R.id.missionPhotoRadio)
        missionManualRadio = view.findViewById(R.id.missionManualRadio)
        locationSectionContainer = view.findViewById(R.id.locationSectionContainer)
        targetLocationView = view.findViewById(R.id.targetLocationView)
        alarmSummaryView = view.findViewById(R.id.alarmSummaryView)

        appVersionInfoText.text = getString(R.string.app_version_info, BuildConfig.VERSION_NAME)
        developerModeHintText.text = getString(R.string.app_version_dev_mode_hint)
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val usageEnabled = prefs.getBoolean(PREF_KEY_USAGE_STATS_ENABLED, false)
        usageStatsEnabledSwitch.isChecked = usageEnabled
        usageStatsEnabledSwitch.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean(PREF_KEY_USAGE_STATS_ENABLED, isChecked).apply()
            refreshUsageAccessStatusUi()
            if (isChecked) maybePromptUsageAccessOnce()
        }
        openUsageAccessSettingsButton.setOnClickListener { openUsageAccessSettings() }
        viewDataPolicyButton.setOnClickListener { showUsageAccessPolicyDialog() }
        refreshUsageAccessStatusUi()
        isDeveloperModeEnabled = prefs.getBoolean(PREF_KEY_DEVELOPER_MODE, false)
        refreshDeveloperModeUi()
        refreshGeneralSettingsVisibility()
        appVersionInfoText.setOnClickListener { onDeveloperModeTapped() }

        initializeDefaults()
        sourceTypeGroup.setOnCheckedChangeListener { _, _ ->
            sourceChangedByUser = true
            applySourceRules()
            refreshMissionUi()
        }
        missionTypeGroup.setOnCheckedChangeListener { _, _ ->
            refreshMissionUi()
        }

        view.findViewById<Button>(R.id.saveCurrentLocationButton).setOnClickListener {
            ensureLocationPermissionThenSaveTarget()
        }
        view.findViewById<Button>(R.id.scheduleAlarmButton).setOnClickListener {
            scheduleAlarm()
        }
        syncServerAlarmsButton.setOnClickListener {
            syncServerReminders()
        }
        loginSyncUserButton.setOnClickListener {
            val code = syncUserIdInput.text?.toString()?.trim().orEmpty()
            claimPairingAndLogin(code)
        }
        scanPairingQrButton.setOnClickListener { startQrScan() }
        logoutSyncUserButton.setOnClickListener {
            logoutSyncUser()
        }
        editLoginButton.setOnClickListener {
            loginFormContainer.visibility = View.VISIBLE
            editLoginButton.visibility = View.GONE
        }
        behaviorStartButton.setOnClickListener {
            if (!ensureUsageAccessForFocusStart()) return@setOnClickListener
            startBehaviorAgent()
        }
        behaviorStopButton.setOnClickListener {
            BehaviorAgentController.stop(requireContext())
            stopFocusSession()
            clearRecoveryTrackingState()
            refreshBehaviorStatusUi()
            toast("Behavior agent stopped")
        }
        behaviorFlushButton.setOnClickListener {
            BehaviorAgentController.flush(requireContext())
            refreshBehaviorStatusUi()
            toast("Behavior queue flush requested")
        }
        behaviorRefreshQuestionButton.setOnClickListener {
            refreshPendingBehaviorQuestion(manual = true)
        }
        behaviorAnswerWorkButton.setOnClickListener {
            if (currentBehaviorQuestion?.isSoftNudge == true) {
                handleSoftNudgeAcknowledge()
            } else {
                answerPendingBehaviorQuestion("work")
            }
        }
        behaviorAnswerRestButton.setOnClickListener {
            if (currentBehaviorQuestion?.isSoftNudge == true) {
                handleSoftNudgeNeedRecovery()
            } else {
                answerPendingBehaviorQuestion("rest")
            }
        }
        behaviorAnswerMoveButton.setOnClickListener {
            answerPendingBehaviorQuestion("move")
        }
        behaviorAnswerExerciseButton.setOnClickListener {
            answerPendingBehaviorQuestion("exercise")
        }
        behaviorAnswerOtherButton.setOnClickListener {
            answerPendingBehaviorQuestion("other")
        }
        behaviorDismissQuestionButton.setOnClickListener {
            dismissPendingBehaviorQuestion()
        }
        view.findViewById<Button>(R.id.cancelAlarmButton).setOnClickListener {
            cancelLastAlarm()
        }

        restoreSyncInputs()
        maybePromptNotificationPermission()
        applySourceRules()
        refreshMissionUi()
        refreshTargetLocationUi()
        refreshAlarmSummaryUi()
        refreshBehaviorStatusUi()
        refreshBehaviorQuestionUi()
        refreshPendingBehaviorQuestion(manual = false)
    }
    override fun onResume() {
        super.onResume()
        refreshGeneralSettingsVisibility()
        refreshBehaviorStatusUi()
        refreshPendingBehaviorQuestion(manual = false)
        startBehaviorQuestionPolling()
        showBehaviorQuestionSheet(currentBehaviorQuestion)
        startRecoveryTimerIfNeeded()
    }

    override fun onPause() {
        super.onPause()
        stopBehaviorQuestionPolling()
        behaviorQuestionSheet?.dismiss()
        triggerDistractionRecoveryFromLifecycle()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        stopBehaviorQuestionPolling()
        behaviorQuestionSheet?.dismiss()
        stopRecoveryTimer()
    }

    private fun startBehaviorQuestionPolling() {
        if (behaviorQuestionPollingActive) return
        behaviorQuestionPollingActive = true

        behaviorQuestionPollRunnable = object : Runnable {
            override fun run() {
                if (!behaviorQuestionPollingActive || !isAdded) return
                refreshPendingBehaviorQuestion(manual = false)
                behaviorQuestionPollHandler.postDelayed(
                    this,
                    SOFT_NUDGE_POLL_INTERVAL_MS,
                )
            }
        }

        behaviorQuestionPollRunnable?.let { behaviorQuestionPollHandler.post(it) }
    }

    private fun stopBehaviorQuestionPolling() {
        behaviorQuestionPollRunnable?.let { behaviorQuestionPollHandler.removeCallbacks(it) }
        behaviorQuestionPollRunnable = null
        behaviorQuestionPollingActive = false
    }

    private fun initializeDefaults() {
        sourceServiceRadio.isChecked = true
        missionLocationRadio.isChecked = true

        val todayKst = ZonedDateTime.now(koreaZoneId).toLocalDate()
        datePicker.updateDate(todayKst.year, todayKst.monthValue - 1, todayKst.dayOfMonth)
        datePicker.minDate = todayKst.atStartOfDay(koreaZoneId).toInstant().toEpochMilli()
    }

    private fun maybePromptNotificationPermission() {
        if (areNotificationsEnabled()) return
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val prompted = prefs.getBoolean(PREF_KEY_NOTIFICATION_PROMPTED, false)
        if (prompted) {
            return
        }
        prefs.edit().putBoolean(PREF_KEY_NOTIFICATION_PROMPTED, true).apply()
        showNotificationPermissionDialog()
    }

    private fun areNotificationsEnabled(): Boolean {
        return NotificationManagerCompat.from(requireContext()).areNotificationsEnabled()
    }

    private fun showNotificationPermissionDialog() {
        if (!isAdded) return
        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.notif_permission_title))
            .setMessage(getString(R.string.notif_permission_body))
            .setPositiveButton(getString(R.string.notif_permission_allow)) { _, _ ->
                requestNotificationPermissionIfNeeded()
            }
            .setNegativeButton(getString(R.string.notif_permission_later), null)
            .show()
    }

    private fun showNotificationSettingsDialog() {
        if (!isAdded) return
        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.notif_permission_title))
            .setMessage(getString(R.string.notif_permission_denied_body))
            .setPositiveButton(getString(R.string.notif_permission_settings)) { _, _ ->
                openNotificationSettings()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun handleNotificationPermissionResult(granted: Boolean) {
        if (granted) {
            toast(getString(R.string.notif_permission_granted))
            return
        }
        showNotificationSettingsDialog()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            if (!areNotificationsEnabled()) {
                openNotificationSettings()
            }
            return
        }
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun openNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, requireContext().packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:" + requireContext().packageName)
            }
        }
        runCatching { startActivity(intent) }
    }

    private fun ensureLocationPermissionThenSaveTarget() {
        if (hasLocationPermission()) {
            saveCurrentLocationAsTarget()
            return
        }
        waitingSaveTargetAfterPermission = true
        requestLocationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            )
        )
    }

    @SuppressLint("MissingPermission")
    private fun saveCurrentLocationAsTarget() {
        if (!hasLocationPermission()) {
            toast(getString(R.string.msg_location_permission_required))
            return
        }

        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(5_000L)
            .build()
        val tokenSource = CancellationTokenSource()
        val fused = LocationServices.getFusedLocationProviderClient(requireContext())
        fused.getCurrentLocation(request, tokenSource.token)
            .addOnSuccessListener { location ->
                if (location == null) {
                    toast(getString(R.string.msg_location_retry_failed))
                    return@addOnSuccessListener
                }
                repository.setTargetLocation(
                    TargetLocation(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        radiusMeters = TargetLocation.DEFAULT_RADIUS_METERS,
                    )
                )
                refreshTargetLocationUi()
                toast(getString(R.string.msg_target_saved))
            }
            .addOnFailureListener {
                val reason = it.message ?: getString(R.string.msg_location_measure_failed)
                toast(getString(R.string.msg_target_save_failed, reason))
            }
    }

    private fun hasLocationPermission(): Boolean {
        val hasFine = ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        return hasFine || hasCoarse
    }

    private fun scheduleAlarm() {
        val sourceType = selectedSourceType()
        val missionType = selectedMissionType(sourceType)
        val target = repository.getTargetLocation()
        val clientRequestId = UUID.randomUUID().toString()
        if (missionType == AlarmMissionType.LOCATION_ARRIVAL && target == null) {
            toast(getString(R.string.msg_target_missing))
            return
        }

        if (!ensureExactAlarmPermission()) {
            toast(getString(R.string.msg_exact_alarm_permission_needed))
            return
        }

        val triggerAtMillis = computeTriggerAtMillis()
        if (triggerAtMillis == null) {
            toast(getString(R.string.msg_alarm_time_past))
            return
        }
        val alarmId = UUID.randomUUID().toString()
        val planDate = selectedPlanDate().toString()
        val fallbackLabel = when (sourceType) {
            AlarmSourceType.GOOGLE -> getString(R.string.source_google)
            AlarmSourceType.SERVICE -> getString(R.string.source_service)
        }
        val label = alarmLabelInput.text?.toString()?.trim().orEmpty().ifBlank { fallbackLabel }

        val job = AlarmJob(
            alarmId = alarmId,
            triggerAtMillis = triggerAtMillis,
            label = label,
            targetLatitude = if (missionType == AlarmMissionType.LOCATION_ARRIVAL) target?.latitude else null,
            targetLongitude = if (missionType == AlarmMissionType.LOCATION_ARRIVAL) target?.longitude else null,
            radiusMeters = if (missionType == AlarmMissionType.LOCATION_ARRIVAL) {
                target?.radiusMeters ?: TargetLocation.DEFAULT_RADIUS_METERS
            } else {
                TargetLocation.DEFAULT_RADIUS_METERS
            },
            planDate = planDate,
            taskUid = "",
            missionType = missionType.value,
            sourceType = sourceType.value,
        )
        scheduler.schedule(job)
        repository.setLastAlarmId(alarmId)
        refreshAlarmSummaryUi()
        toast(getString(R.string.msg_alarm_scheduled, formatTime(triggerAtMillis)))

        val alarmTimeLocal = selectedAlarmTimeLocal()
        saveDayPlanToServerIfConfigured(
            alarmId = alarmId,
            planDate = planDate,
            alarmTimeLocal = alarmTimeLocal,
            label = label,
            sourceType = sourceType,
            missionType = missionType,
            target = target,
            clientRequestId = clientRequestId,
        )
    }

    private fun selectedPlanDate(): LocalDate {
        return LocalDate.of(datePicker.year, datePicker.month + 1, datePicker.dayOfMonth)
    }

    private fun selectedAlarmTimeLocal(): String {
        val hour = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) timePicker.hour else timePicker.currentHour
        val minute = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) timePicker.minute else timePicker.currentMinute
        return String.format(Locale.US, "%02d:%02d", hour, minute)
    }

    private fun saveDayPlanToServerIfConfigured(
        alarmId: String,
        planDate: String,
        alarmTimeLocal: String,
        label: String,
        sourceType: AlarmSourceType,
        missionType: AlarmMissionType,
        target: TargetLocation?,
        clientRequestId: String,
    ) {
        val syncConfig = ReminderSyncManager.loadConfig(requireContext()) ?: return
        val accessToken = behaviorAccessTokenInput.text
            ?.toString()
            ?.trim()
            ?.ifBlank { null }
            ?: behaviorConfigStore.loadAccessToken()
        if (accessToken.isNullOrBlank()) return

        Thread {
            val result = runCatching {
                val client = ReminderSyncClient(syncConfig.baseUrl)
                val expectedVersion = client.getPlanDayVersionByDate(
                    planDate = planDate,
                    accessToken = accessToken,
                )
                client.savePlanDayWithSingleAlarm(
                    userId = syncConfig.userId,
                    planDate = planDate,
                    alarmTimeLocal = alarmTimeLocal,
                    title = label,
                    sourceType = sourceType,
                    missionType = missionType,
                    targetLatitude = if (missionType == AlarmMissionType.LOCATION_ARRIVAL) target?.latitude else null,
                    targetLongitude = if (missionType == AlarmMissionType.LOCATION_ARRIVAL) target?.longitude else null,
                    radiusMeters = if (missionType == AlarmMissionType.LOCATION_ARRIVAL) {
                        target?.radiusMeters ?: TargetLocation.DEFAULT_RADIUS_METERS
                    } else {
                        TargetLocation.DEFAULT_RADIUS_METERS
                    },
                    clientRequestId = clientRequestId,
                    expectedVersion = expectedVersion,
                    accessToken = accessToken,
                )
            }

            runOnUiThreadSafe {
                result.onSuccess { saved ->
                    val existing = repository.getAlarm(alarmId)
                    if (existing != null) {
                        repository.upsertAlarm(
                            existing.copy(
                                planDate = saved.date,
                                taskUid = saved.taskUid ?: existing.taskUid,
                            ),
                        )
                        refreshAlarmSummaryUi()
                    }
                }
                result.onFailure { err ->
                    toast("Server save failed: ${err.message ?: "unknown"}")
                }
            }
        }.start()
    }

    private fun ensureExactAlarmPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val am = requireContext().getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (am.canScheduleExactAlarms()) return true

        runCatching {
            startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
        }
        return false
    }

    private fun cancelLastAlarm() {
        val lastId = repository.getLastAlarmId()
        if (lastId.isNullOrBlank()) {
            toast(getString(R.string.msg_no_alarm_to_cancel))
            return
        }
        scheduler.cancel(lastId)
        repository.setLastAlarmId(null)
        AlarmSoundService.stop(requireContext())
        refreshAlarmSummaryUi()
        toast(getString(R.string.msg_alarm_cancelled))
    }

    private fun computeTriggerAtMillis(): Long? {
        val hour = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) timePicker.hour else timePicker.currentHour
        val minute = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) timePicker.minute else timePicker.currentMinute
        val pickedDate = LocalDate.of(datePicker.year, datePicker.month + 1, datePicker.dayOfMonth)
        val pickedTime = LocalTime.of(hour, minute)
        val target = ZonedDateTime.of(pickedDate, pickedTime, koreaZoneId)
        val now = ZonedDateTime.now(koreaZoneId)
        if (!target.isAfter(now)) {
            return null
        }
        return target.toInstant().toEpochMilli()
    }

    private fun refreshTargetLocationUi() {
        val target = repository.getTargetLocation()
        targetLocationView.text = if (target == null) {
            getString(R.string.target_location_not_set)
        } else {
            getString(
                R.string.format_target_location,
                target.latitude,
                target.longitude,
                target.radiusMeters,
            )
        }
    }

    private fun refreshAlarmSummaryUi() {
        val alarm = repository.getLastAlarmId()?.let { repository.getAlarm(it) }
        alarmSummaryView.text = if (alarm == null || !alarm.enabled) {
            getString(R.string.summary_no_active_alarm)
        } else {
            val missionLabel = when (alarm.missionType) {
                AlarmMissionType.MANUAL_DISMISS.value -> getString(R.string.label_manual_mission_short)
                AlarmMissionType.TIME_CHECK.value -> getString(R.string.label_manual_mission_short)
                AlarmMissionType.PHOTO.value -> "photo"
                else -> getString(R.string.label_location_mission_short)
            }
            val sourceLabel = if (alarm.sourceType == AlarmSourceType.GOOGLE.value) {
                getString(R.string.label_source_google_short)
            } else {
                getString(R.string.label_source_service_short)
            }
            getString(
                R.string.format_alarm_summary_active,
                alarm.label,
                formatTime(alarm.triggerAtMillis),
                missionLabel,
                sourceLabel,
                alarm.alarmId.take(8),
            )
        }
    }

    private fun formatTime(millis: Long): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.KOREA)
        fmt.timeZone = TimeZone.getTimeZone(koreaZoneId)
        return fmt.format(Date(millis))
    }

    private fun selectedSourceType(): AlarmSourceType {
        return if (sourceGoogleRadio.isChecked) AlarmSourceType.GOOGLE else AlarmSourceType.SERVICE
    }

    private fun selectedMissionType(sourceType: AlarmSourceType): AlarmMissionType {
        return when {
            missionLocationRadio.isChecked -> AlarmMissionType.LOCATION_ARRIVAL
            missionPhotoRadio.isChecked -> AlarmMissionType.PHOTO
            else -> AlarmMissionType.MANUAL_DISMISS
        }
    }

    private fun applySourceRules() {
        missionLocationRadio.isEnabled = true
        missionPhotoRadio.isEnabled = true
        missionManualRadio.isEnabled = true
    }

    private fun refreshMissionUi() {
        val source = selectedSourceType()
        val mission = selectedMissionType(source)
        locationSectionContainer.visibility =
            if (mission == AlarmMissionType.LOCATION_ARRIVAL) View.VISIBLE else View.GONE
    }

    private fun restoreSyncInputs() {
        val config = ReminderSyncManager.loadConfig(requireContext())
        val baseUrl = config?.baseUrl ?: BuildConfig.BACKEND_BASE_URL
        val userId = config?.userId.orEmpty()
        val token = behaviorConfigStore.loadAccessToken().orEmpty()
        backendBaseUrlInput.setText(baseUrl)
        syncUserIdInput.setText(userId)
        behaviorAccessTokenInput.setText(token)
        restoreRecoveryTimerConfig()
        refreshLoginStatusUi(config?.userId)
        if (config != null) {
            // Auto-sync when config exists to avoid manual login each time.
            ReminderSyncWorkScheduler.ensurePeriodicSync(requireContext())
            ReminderSyncWorkScheduler.triggerImmediateSync(requireContext())
        }
    }

    private fun restoreRecoveryTimerConfig() {
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val sensitivity = prefs.getString(PREF_KEY_RECOVERY_SENSITIVITY, "normal")
            ?.trim()
            ?.ifBlank { "normal" }
            ?: "normal"
        val scheduleStartDelayMin = prefs.getInt(PREF_KEY_SCHEDULE_START_DELAY_MIN, 3).coerceIn(1, 60)
        val progressBlockedMin = prefs.getInt(PREF_KEY_PROGRESS_BLOCKED_MIN, 8).coerceIn(1, 120)
        val config = RecoveryTimerConfig(
            sensitivity = sensitivity,
            scheduleStartDelayMinutes = scheduleStartDelayMin,
            progressBlockedMinutes = progressBlockedMin,
        )
        recoveryTimerConfig = config
        applyRecoveryTimerConfigToUi(config)
    }

    private fun applyRecoveryTimerConfigToUi(config: RecoveryTimerConfig) {
        when (config.sensitivity) {
            "sensitive" -> recoverySensitivitySensitive.isChecked = true
            "relaxed" -> recoverySensitivityRelaxed.isChecked = true
            else -> recoverySensitivityNormal.isChecked = true
        }
        scheduleStartDelayMinInput.setText(config.scheduleStartDelayMinutes.toString())
        progressBlockedMinInput.setText(config.progressBlockedMinutes.toString())
    }

    private fun selectedRecoverySensitivity(): String {
        return when (recoverySensitivityGroup.checkedRadioButtonId) {
            R.id.recoverySensitivitySensitive -> "sensitive"
            R.id.recoverySensitivityRelaxed -> "relaxed"
            else -> "normal"
        }
    }

    private fun collectRecoveryTimerConfig(silent: Boolean): RecoveryTimerConfig? {
        val scheduleStartDelayMin = scheduleStartDelayMinInput.text?.toString()?.trim()?.toIntOrNull()
        val progressBlockedMin = progressBlockedMinInput.text?.toString()?.trim()?.toIntOrNull()
        if (scheduleStartDelayMin == null || scheduleStartDelayMin !in 1..60) {
            if (!silent) toast("시작 지연 시간은 1~60분으로 입력해주세요.")
            return null
        }
        if (progressBlockedMin == null || progressBlockedMin !in 1..120) {
            if (!silent) toast("진행 막힘 시간은 1~120분으로 입력해주세요.")
            return null
        }
        val config = RecoveryTimerConfig(
            sensitivity = selectedRecoverySensitivity(),
            scheduleStartDelayMinutes = scheduleStartDelayMin,
            progressBlockedMinutes = progressBlockedMin,
        )
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(PREF_KEY_RECOVERY_SENSITIVITY, config.sensitivity)
            .putInt(PREF_KEY_SCHEDULE_START_DELAY_MIN, config.scheduleStartDelayMinutes)
            .putInt(PREF_KEY_PROGRESS_BLOCKED_MIN, config.progressBlockedMinutes)
            .apply()
        return config
    }

    private fun applyDeveloperModeVisibility(isLoggedIn: Boolean) {
        val showDevOnlyControls = isDeveloperModeEnabled
        behaviorAccessTokenInput.visibility = if (showDevOnlyControls) View.VISIBLE else View.GONE
        syncServerAlarmsButton.visibility = if (showDevOnlyControls) View.VISIBLE else View.GONE
        loggedInUserStatusView.visibility = View.VISIBLE

        loginFormContainer.visibility = if (isLoggedIn) View.GONE else View.VISIBLE
        editLoginButton.visibility = if (isLoggedIn) View.VISIBLE else View.GONE
        logoutSyncUserButton.visibility = if (isLoggedIn) View.VISIBLE else View.GONE
    }

    private fun refreshLoginStatusUi(userId: String?) {
        val trimmed = userId?.trim().orEmpty()
        if (trimmed.isBlank()) {
            loggedInUserStatusView.text = getString(R.string.login_status_not_logged_in)
            applyDeveloperModeVisibility(false)
            return
        }
        loggedInUserStatusView.text = getString(R.string.login_status_logged_in_auto_sync, trimmed)
        applyDeveloperModeVisibility(true)
    }

    private fun syncServerReminders() {
        val savedConfig = ReminderSyncManager.loadConfig(requireContext())
        if (savedConfig == null) {
            toast(getString(R.string.msg_login_required_for_sync))
            return
        }

        syncServerAlarmsButton.isEnabled = false
        Thread {
            val result = runCatching {
                ReminderSyncManager.syncWithSavedConfig(context = requireContext(),
                    limit = 80,
                )
            }

            runOnUiThreadSafe {
                syncServerAlarmsButton.isEnabled = true
                result.onSuccess { summary ->
                    refreshAlarmSummaryUi()
                    refreshLoginStatusUi(savedConfig.userId)
                    if (summary.skippedCount > 0) {
                        toast(
                            getString(
                                R.string.msg_sync_success_with_skip_detail,
                                summary.scheduledCount,
                                summary.skippedCount,
                                summary.skippedPastCount,
                                summary.skippedMissingTargetCount,
                            ),
                        )
                    } else {
                        toast(getString(R.string.msg_sync_success, summary.scheduledCount))
                    }
                }.onFailure { err ->
                    toast(getString(R.string.msg_sync_failed, err.message ?: "unknown"))
                }
            }
        }.start()
    }

    private fun claimPairingAndLogin(code: String) {
        val pairingCode = code.trim()
        if (pairingCode.isBlank()) {
            toast(getString(R.string.msg_login_identifier_required))
            return
        }

        val baseUrl = ReminderSyncManager.normalizeBaseUrl(BuildConfig.BACKEND_BASE_URL)
        if (baseUrl == null) {
            toast(getString(R.string.msg_sync_backend_url_required))
            return
        }
        backendBaseUrlInput.setText(baseUrl)
        val previousUserId = ReminderSyncManager.loadConfig(requireContext())?.userId

        loginSyncUserButton.isEnabled = false
        scanPairingQrButton.isEnabled = false
        Thread {
            val result = runCatching {
                val userId = ReminderSyncClient(baseUrl).claimPairing(pairingCode)
                ReminderSyncManager.saveConfig(requireContext(), baseUrl, userId)
                ReminderSyncWorkScheduler.ensurePeriodicSync(requireContext())
                ReminderSyncWorkScheduler.triggerImmediateSync(requireContext())
                val syncResult = ReminderSyncManager.syncNow(
                    context = requireContext(),
                    baseUrl = baseUrl,
                    userId = userId,
                    limit = 80,
                )
                Pair(userId, syncResult)
            }

            runOnUiThreadSafe {
                loginSyncUserButton.isEnabled = true
                scanPairingQrButton.isEnabled = true
                result.onSuccess { (userId, syncResult) ->
                    syncUserIdInput.setText(userId)
                    if (previousUserId != null && previousUserId != userId) {
                        behaviorQueueRepository.clearAll()
                    }
                    refreshLoginStatusUi(userId)
                    refreshAlarmSummaryUi()
                    behaviorConfigStore.saveAccessToken(behaviorAccessTokenInput.text?.toString())
                    BehaviorAgentController.start(requireContext())
                    refreshBehaviorStatusUi()

                    val behaviorStartedMessage = "Behavior auto-started"
                    if (syncResult.skippedCount > 0) {
                        toast(
                            "${getString(R.string.msg_login_success, userId)} / " +
                                getString(
                                    R.string.msg_sync_success_with_skip_detail,
                                    syncResult.scheduledCount,
                                    syncResult.skippedCount,
                                    syncResult.skippedPastCount,
                                    syncResult.skippedMissingTargetCount,
                                ) +
                                " / $behaviorStartedMessage",
                        )
                    } else {
                        toast(
                            "${getString(R.string.msg_login_success, userId)} / " +
                                getString(R.string.msg_sync_success, syncResult.scheduledCount) +
                                " / $behaviorStartedMessage",
                        )
                    }
                }.onFailure { err ->
                    val message = err.message ?: "unknown"
                    toast(getString(R.string.msg_login_failed, message))
                }
            }
        }.start()
    }

    private fun logoutSyncUser() {
        BehaviorAgentController.stop(requireContext())
        ReminderSyncManager.clearConfig(requireContext())
        behaviorConfigStore.saveAccessToken(null)
        behaviorQueueRepository.clearAll()

        syncUserIdInput.setText("")
        backendBaseUrlInput.setText(BuildConfig.BACKEND_BASE_URL)

        refreshLoginStatusUi(null)
        refreshAlarmSummaryUi()
        refreshBehaviorStatusUi()
        applyDeveloperModeVisibility(isLoggedIn = false)
        toast(getString(R.string.msg_logout_done))
    }

    private fun startBehaviorAgent() {
        if (!ensureUsageAccessForFocusStart()) return
        val inputs = collectBehaviorStartInputs(silent = false) ?: return
        val timerConfig = collectRecoveryTimerConfig(silent = false) ?: return
        recoveryTimerConfig = timerConfig
        ReminderSyncManager.saveConfig(requireContext(), inputs.baseUrl, inputs.userId)
        behaviorConfigStore.saveAccessToken(inputs.accessToken)
        ReminderSyncWorkScheduler.ensurePeriodicSync(requireContext())
        BehaviorAgentController.start(requireContext())
        clearRecoveryTrackingState()
        startFocusSession(inputs)
        refreshBehaviorStatusUi()
        refreshPendingBehaviorQuestion(manual = false)
        toast("Behavior agent started")
    }

    private fun startFocusSession(inputs: BehaviorStartInputs) {
        Thread {
            val result = runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )
                val payload = JSONObject()
                    .put("user_id", inputs.userId)
                    .put("schedule_type", "focus")
                    .put("auto_end_existing", true)
                val resp = client.post("/api/spec/focus-sessions/start", payload.toString())
                if (resp.statusCode !in 200..299) {
                    throw IllegalStateException("HTTP ${resp.statusCode}: ${resp.body}")
                }
                parseFocusSessionId(resp.body)
            }
            runOnUiThreadSafe {
                result.onSuccess { focusSessionId ->
                    beginRecoveryTracking(focusSessionId)
                }
                result.onFailure { err ->
                    toast("Focus session start failed: ${err.message ?: "unknown"}")
                }
            }
        }.start()
    }

    private fun parseFocusSessionId(body: String): String? {
        val obj = runCatching { JSONObject(body) }.getOrNull() ?: return null
        return obj.optString("focus_session_id").orEmpty().ifBlank { null }
    }

    private fun beginRecoveryTracking(focusSessionId: String?) {
        activeFocusSessionId = focusSessionId
        focusSessionStartedAt = System.currentTimeMillis()
        activeScheduleName = resolveScheduleNameForUi()
        hasMeaningfulProgress = false
        lastMeaningfulProgressAt = focusSessionStartedAt
        scheduleStartEventSent = false
        lastProgressBlockedEventAt = 0L
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val enabled = prefs.getBoolean(PREF_KEY_USAGE_STATS_ENABLED, false)
        if (!enabled) {
            runCatching { usagePoller?.stop() }
            usagePoller = null
            usageTracker = null
        } else {
            usageTracker = com.eft.mobileagent.behavior.usage.UsageSessionTracker().apply {
                reset(focusSessionStartedAt)
            }
            usagePoller = com.eft.mobileagent.behavior.usage.UsageStatsPoller(
                requireContext(),
                usageTracker!!,
            ) { recent, nowMs ->
                runOnUiThreadSafe { maybePromptRealtimeDistraction(recent = recent, nowMs = nowMs) }
            }
            runCatching { usagePoller?.start() }
        }

        startRecoveryTimerIfNeeded()
    }

    private fun clearRecoveryTrackingState() {
        stopRecoveryTimer()
        activeFocusSessionId = null
        focusSessionStartedAt = 0L
        activeScheduleName = null
        hasMeaningfulProgress = false
        lastMeaningfulProgressAt = 0L
        scheduleStartEventSent = false
        lastProgressBlockedEventAt = 0L

        runCatching { usagePoller?.stop() }
        usagePoller = null
        usageTracker = null
        lastRealtimeDistractionPromptAt = 0L
        snoozeRealtimeUntilAt = 0L
        realtimePromptShowing = false
    }

    private fun resolveScheduleNameForUi(): String {
        val repo = AlarmRepository(requireContext())
        val lastId = repo.getLastAlarmId()
        val job = if (!lastId.isNullOrBlank()) repo.getAlarm(lastId) else null
        val label = job?.label?.trim().orEmpty()
        return if (label.isNotBlank()) label else "업무 세션"
    }

    private fun maybePromptRealtimeDistraction(
        recent: List<com.eft.mobileagent.behavior.usage.AppUsageStat>,
        nowMs: Long,
    ) {
        if (focusSessionStartedAt <= 0L) return
        if (!hasMeaningfulProgress) return
        if (realtimePromptShowing) return
        if (nowMs < snoozeRealtimeUntilAt) return
        if (nowMs - lastRealtimeDistractionPromptAt < REALTIME_PROMPT_COOLDOWN_MS) return

        val topExternal = recent.firstOrNull {
            it.category != "WorkTool" && it.category != "System" && it.category != "Browser"
        } ?: return
        if (topExternal.seconds < REALTIME_MIN_EXTERNAL_SECONDS) return

        val cat = topExternal.category
        if (cat != "YouTube" && cat != "SNS" && cat != "Other") return

        val scheduleName = (activeScheduleName ?: "업무 세션")
        showRealtimeDistractionDialog(
            scheduleName = scheduleName,
            distractionCategory = cat,
            seconds = topExternal.seconds,
            nowMs = nowMs,
        )
    }

    private fun showRealtimeDistractionDialog(
        scheduleName: String,
        distractionCategory: String,
        seconds: Int,
        nowMs: Long,
    ) {
        if (!isAdded) return
        realtimePromptShowing = true
        lastRealtimeDistractionPromptAt = nowMs

        val body =
            "“$scheduleName” 중에 [$distractionCategory]로 이탈했어요 (최근 ${seconds}초).\n" +
                "업무가 막힌 지점이 있나요?\n\n" +
                "지금 감정을 처리하면 다시 시작하기 쉬워져요."

        AlertDialog.Builder(requireContext())
            .setTitle("딴짓 신호 감지")
            .setMessage(body)
            .setPositiveButton("감정 처리하기") { _, _ ->
                sendRecoveryEvent(
                    entryPoint = "distraction_detected",
                    sessionState = "in_progress",
                    blockedMin = null,
                    distractionType = distractionCategory,
                    confidence = 0.74,
                    source = "android_usage_realtime",
                    openWeb = true,
                )
                realtimePromptShowing = false
            }
            .setNegativeButton("괜찮아요") { _, _ ->
                realtimePromptShowing = false
            }
            .setNeutralButton("5분 뒤 다시") { _, _ ->
                snoozeRealtimeUntilAt = nowMs + REALTIME_SNOOZE_MS
                realtimePromptShowing = false
            }
            .setOnDismissListener { realtimePromptShowing = false }
            .show()
    }

    private fun markMeaningfulProgress() {
        val now = System.currentTimeMillis()
        hasMeaningfulProgress = true
        lastMeaningfulProgressAt = now
    }

    private fun startRecoveryTimerIfNeeded() {
        if (focusSessionStartedAt <= 0L) return
        if (recoveryTimerRunnable != null) return
        recoveryTimerRunnable = object : Runnable {
            override fun run() {
                if (!isAdded || focusSessionStartedAt <= 0L) {
                    recoveryTimerRunnable = null
                    return
                }
                evaluateRecoveryTimerTick()
                recoveryTimerHandler.postDelayed(this, RECOVERY_TIMER_TICK_MS)
            }
        }
        recoveryTimerRunnable?.let { recoveryTimerHandler.postDelayed(it, RECOVERY_TIMER_TICK_MS) }
    }

    private fun stopRecoveryTimer() {
        recoveryTimerRunnable?.let { recoveryTimerHandler.removeCallbacks(it) }
        recoveryTimerRunnable = null
    }

    private fun evaluateRecoveryTimerTick() {
        val startedAt = focusSessionStartedAt
        if (startedAt <= 0L) return
        val now = System.currentTimeMillis()
        val elapsed = now - startedAt
        val scheduleStartDelayMs = recoveryTimerConfig.scheduleStartDelayMinutes * 60_000L
        val progressBlockedDelayMs = recoveryTimerConfig.progressBlockedMinutes * 60_000L
        if (!scheduleStartEventSent && !hasMeaningfulProgress && elapsed >= scheduleStartDelayMs) {
            scheduleStartEventSent = true
            val blockedMin = (elapsed / 60_000L).toInt().coerceAtLeast(1)
            sendRecoveryEvent(
                entryPoint = "schedule_start",
                sessionState = "start",
                blockedMin = blockedMin,
                distractionType = null,
                confidence = 0.66,
                source = "android_timer_start",
                openWeb = true,
            )
        }

        if (!hasMeaningfulProgress) return
        val blockedMs = now - lastMeaningfulProgressAt
        if (blockedMs < progressBlockedDelayMs) return
        if (now - lastProgressBlockedEventAt < PROGRESS_BLOCKED_REPEAT_MS) return
        lastProgressBlockedEventAt = now
        val blockedMin = (blockedMs / 60_000L).toInt().coerceAtLeast(1)
        sendRecoveryEvent(
            entryPoint = "progress_blocked",
            sessionState = "in_progress",
            blockedMin = blockedMin,
            distractionType = null,
            confidence = 0.68,
            source = "android_timer_progress",
            openWeb = true,
        )
    }

    private fun stopFocusSession() {
        val focusSessionId = activeFocusSessionId ?: return
        val inputs = collectBehaviorStartInputs(silent = true) ?: return

        runCatching {
            usagePoller?.forcePollNow()
            usagePoller?.stop()

            val now = System.currentTimeMillis()
            usageTracker?.finalizeTo(now)

            val summary = usageTracker?.buildSummarySorted().orEmpty()
            if (summary.isNotEmpty()) {
                val mismatch = com.eft.mobileagent.behavior.usage.AdvancedMismatch.evaluate(
                    focusSessionStartedAt = focusSessionStartedAt,
                    focusSessionEndedAt = now,
                    observed = summary,
                    switchCount = usageTracker?.getSwitchCount() ?: 0,
                    hasMeaningfulProgress = hasMeaningfulProgress,
                    lastMeaningfulProgressAt = lastMeaningfulProgressAt,
                )

                val observedJson = JSONArray()
                for (s in summary.take(10)) {
                    observedJson.put(
                        JSONObject()
                            .put("category", s.category)
                            .put("seconds", s.seconds)
                            .put("count", s.count),
                    )
                }

                val topDistraction = summary.firstOrNull {
                    it.category != "WorkTool" && it.category != "System"
                }?.category
                val totalSeconds = summary.sumOf { it.seconds }.coerceAtLeast(1)
                val externalSeconds = summary.filter { it.category != "WorkTool" }.sumOf { it.seconds }
                val durationRatio = (externalSeconds.toDouble() / totalSeconds.toDouble()).coerceIn(0.0, 1.0)

                sendRecoveryEventSessionSummary(
                    mismatchScore = mismatch,
                    observedApps = observedJson,
                    distractionAppCategory = topDistraction,
                    durationRatio = durationRatio,
                    switchCount = usageTracker?.getSwitchCount() ?: 0,
                )
            }
        }.onFailure {
            // Swallow usage stats failures to avoid breaking focus stop.
        }

        Thread {
            runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )
                val encodedUserId = URLEncoder.encode(inputs.userId, Charsets.UTF_8.name())
                val path = "/api/spec/focus-sessions/$focusSessionId/stop?user_id=$encodedUserId"
                client.post(path, "{}")
            }
        }.start()
    }

    private fun collectBehaviorStartInputs(silent: Boolean = false): BehaviorStartInputs? {
        val savedConfig = ReminderSyncManager.loadConfig(requireContext())
        val rawUserId = savedConfig?.userId ?: syncUserIdInput.text?.toString()?.trim().orEmpty()
        val userId = resolveBehaviorUserId(rawUserId, silent)
        if (userId == null) {
            if (!silent) toast("Behavior start failed: login first or enter user_id.")
            return null
        }
        if (userId.contains(" ")) {
            if (!silent) toast("Behavior start failed: user_id cannot contain spaces.")
            return null
        }

        val baseUrl = savedConfig?.baseUrl
            ?: ReminderSyncManager.normalizeBaseUrl(backendBaseUrlInput.text?.toString().orEmpty())
        if (baseUrl == null) {
            if (!silent) toast("Behavior start failed: backend URL is required.")
            return null
        }

        val parsed = runCatching { java.net.URI(baseUrl) }.getOrNull()
        if (parsed == null || parsed.scheme.isNullOrBlank() || parsed.host.isNullOrBlank()) {
            if (!silent) toast("Behavior start failed: backend URL is invalid.")
            return null
        }
        val scheme = parsed.scheme.lowercase(Locale.US)
        if (scheme != "http" && scheme != "https") {
            if (!silent) toast("Behavior start failed: URL must start with http:// or https://")
            return null
        }
        val host = parsed.host.lowercase(Locale.US)
        if (host == "localhost" || host == "127.0.0.1") {
            if (!silent) toast("Behavior start failed: use 10.0.2.2 (emulator) or PC LAN IP.")
            return null
        }

        val accessToken = behaviorAccessTokenInput.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        if (!accessToken.isNullOrEmpty() && accessToken.contains(" ")) {
            if (!silent) toast("Behavior start failed: access token should not contain spaces.")
            return null
        }

        return BehaviorStartInputs(
            baseUrl = baseUrl,
            userId = userId,
            accessToken = accessToken,
        )
    }

    private fun resolveBehaviorUserId(rawUserId: String?, silent: Boolean = false): String? {
        val trimmed = rawUserId.orEmpty().trim()
        if (trimmed.isBlank()) {
            return null
        }
        if (trimmed.contains("@")) {
            if (!silent) {
                toast("Behavior user_id cannot be an email. Please login first to get a canonical user_id.")
            }
            return null
        }
        if (trimmed.contains(" ")) {
            if (!silent) {
                toast("Behavior user_id cannot contain spaces.")
            }
            return null
        }
        return trimmed
    }

    private fun refreshBehaviorStatusUi() {
        val pending = behaviorQueueRepository.pendingCount()
        behaviorStatusView.text = "Behavior queue pending: $pending"
    }

    private fun handleSoftNudgeAcknowledge() {
        dismissPendingBehaviorQuestion()
    }

    private fun handleSoftNudgeNeedRecovery() {
        openRecoveryRoutineInWeb()
        dismissPendingBehaviorQuestion()
    }

    private fun triggerDistractionRecoveryFromLifecycle() {
        if (focusSessionStartedAt <= 0L) return
        val now = System.currentTimeMillis()
        if (now - lastLifecycleRecoveryEventAt < LIFECYCLE_RECOVERY_DEBOUNCE_MS) return
        lastLifecycleRecoveryEventAt = now
        sendRecoveryEvent(
            entryPoint = "distraction_detected",
            sessionState = "in_progress",
            blockedMin = null,
            distractionType = "AppBackground",
            confidence = 0.72,
            source = "android_lifecycle",
            openWeb = true,
        )
    }

    private fun adjustedConfidence(base: Double): Double {
        return when (recoveryTimerConfig.sensitivity) {
            "sensitive" -> (base - 0.12).coerceAtLeast(0.40)
            "relaxed" -> (base + 0.10).coerceAtMost(0.95)
            else -> base
        }
    }

    private fun recoveryCooldownMinutes(): Int {
        return when (recoveryTimerConfig.sensitivity) {
            "sensitive" -> 5
            "relaxed" -> 12
            else -> 8
        }
    }

    private fun sendRecoveryEvent(
        entryPoint: String,
        sessionState: String,
        blockedMin: Int?,
        distractionType: String?,
        confidence: Double,
        source: String,
        openWeb: Boolean,
    ) {
        val inputs = collectBehaviorStartInputs(silent = true) ?: return
        Thread {
            val intervention = runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )
                val payload = JSONObject()
                    .put("user_id", inputs.userId)
                    .put("session_state", sessionState)
                    .put("entry_point", entryPoint)
                    .put("schedule_name", (activeScheduleName ?: "업무 세션"))
                    .put("confidence", adjustedConfidence(confidence))
                    .put("cooldown_minutes", recoveryCooldownMinutes())
                    .put("source", source)
                activeFocusSessionId?.let { payload.put("focus_session_id", it) }
                if (blockedMin != null) payload.put("blocked_min", blockedMin)
                if (!distractionType.isNullOrBlank()) payload.put("distraction_type", distractionType)
                val response = client.post(RECOVERY_EVENT_PATH, payload.toString())
                if (response.statusCode !in 200..299) {
                    null
                } else {
                    parseRecoveryIntervention(response.body)
                }
            }.getOrNull()

            runOnUiThreadSafe {
                val url = intervention?.recoveryUrl
                if (openWeb && intervention?.action == "open_web" && !url.isNullOrBlank()) {
                    openRecoveryUrl(url)
                }
            }
        }.start()
    }

    private fun sendRecoveryEventSessionSummary(
        mismatchScore: Double,
        observedApps: JSONArray,
        distractionAppCategory: String?,
        durationRatio: Double,
        switchCount: Int,
    ) {
        val inputs = collectBehaviorStartInputs(silent = true) ?: return
        val focusSessionId = activeFocusSessionId ?: return

        Thread {
            runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )

                val payload = JSONObject()
                    .put("user_id", inputs.userId)
                    .put("focus_session_id", focusSessionId)
                    .put("session_state", "in_progress")
                    .put("entry_point", "session_summary")
                    .put("schedule_name", (activeScheduleName ?: "업무 세션"))
                    .put("confidence", adjustedConfidence(mismatchScore))
                    .put("cooldown_minutes", recoveryCooldownMinutes())
                    .put("source", "android_usage_stats")

                    // enrichment
                    .put("mismatch_score", mismatchScore.coerceIn(0.0, 1.0))
                    .put("observed_apps", observedApps)
                    .put("context_version", "v2")
                    .put("source_detail", "usage_events_pair")
                    .put("summary_reason", "focus_session_end")
                    .put("duration_ratio", durationRatio)
                    .put("switch_count", switchCount)

                var unknownSec = 0
                var systemSec = 0
                var totalSec = 0
                for (i in 0 until observedApps.length()) {
                    val o = observedApps.getJSONObject(i)
                    val cat = o.optString("category")
                    val sec = o.optInt("seconds", 0).coerceAtLeast(0)
                    totalSec += sec
                    if (cat == "Unknown") unknownSec += sec
                    if (cat == "System") systemSec += sec
                }
                val unknownRatio = if (totalSec > 0) unknownSec.toDouble() / totalSec.toDouble() else 0.0
                val systemRatio = if (totalSec > 0) systemSec.toDouble() / totalSec.toDouble() else 0.0

                payload
                    .put("unknown_ratio", unknownRatio)
                    .put("system_ratio", systemRatio)
                    .put("top_categories", JSONArray().apply {
                        val tops = mutableListOf<String>()
                        for (i in 0 until observedApps.length()) {
                            val o = observedApps.getJSONObject(i)
                            val cat = o.optString("category")
                            if (cat == "WorkTool" || cat == "System") continue
                            if (!tops.contains(cat)) tops.add(cat)
                            if (tops.size >= 3) break
                        }
                        tops.forEach { put(it) }
                    })

                if (!distractionAppCategory.isNullOrBlank()) {
                    payload.put("distraction_app_category", distractionAppCategory)
                }

                client.post(RECOVERY_EVENT_PATH, payload.toString())
            }
        }.start()
    }

    private fun parseRecoveryIntervention(body: String): RecoveryInterventionUi? {
        val obj = runCatching { JSONObject(body) }.getOrNull() ?: return null
        val action = obj.optString("action", "ignore").ifBlank { "ignore" }
        val recoveryUrl = obj.optString("recovery_url").orEmpty().ifBlank { null }
        val entrySentence = obj.optString("entry_sentence").orEmpty().ifBlank { null }
        return RecoveryInterventionUi(
            action = action,
            recoveryUrl = recoveryUrl,
            entrySentence = entrySentence,
        )
    }

    private fun openRecoveryRoutineInWeb() {
        val question = currentBehaviorQuestion ?: return
        if (!question.isSoftNudge) return

        val inputs = collectBehaviorStartInputs(silent = true) ?: return
        val encodedUserId = URLEncoder.encode(inputs.userId, Charsets.UTF_8.name())
        val encodedSentence = URLEncoder.encode(question.questionText, Charsets.UTF_8.name())
        val query =
            "question_id=${question.questionId}&user_id=$encodedUserId&entry_point=distraction_detected&sentence=$encodedSentence"
        val candidates = buildRecoveryUrls(
            baseApiUrl = inputs.baseUrl,
            recoveryHintUrl = question.recoveryUrl,
            path = RECOVERY_PAGE_PATH,
            query = query,
        )
        if (candidates.isEmpty()) {
            toast("���� ������ URL �ĺ��� �����ϴ�.")
            return
        }

        Thread {
            val target = candidates.firstOrNull { isRecoveryUrlReachable(it) } ?: candidates.first()
            runOnUiThreadSafe {
                openRecoveryUrl(target)
            }
        }.start()
    }

    private fun openRecoveryUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(intent)
        } catch (e: Exception) {
            toast("�� ���� ������ ���� ����: ${e.message ?: "unknown"}")
        }
    }

    private fun buildRecoveryUrls(
        baseApiUrl: String,
        recoveryHintUrl: String?,
        path: String,
        query: String,
    ): List<String> {
        val candidateSet = LinkedHashSet<String>()
        val recoveryPath = recoveryHintUrl?.trim().orEmpty()
        val normalizedPath = if (recoveryPath.isBlank()) path else recoveryPath
        val normalizedRecoveryUrl = runCatching {
            java.net.URI(normalizedPath)
        }.getOrNull()?.let { uri ->
            if (uri.scheme != null && uri.host != null) appendRecoveryQuery(uri.toString(), query) else ""
        } ?: ""

        if (normalizedRecoveryUrl.isNotBlank()) {
            candidateSet.add(normalizedRecoveryUrl)
        }

        val baseCandidates = buildRecoveryBaseCandidates(baseApiUrl)
        val resolvedPath = if (normalizedPath.startsWith("http://", ignoreCase = true) ||
            normalizedPath.startsWith("https://", ignoreCase = true)
        ) {
            null
        } else {
            if (normalizedPath.startsWith("/")) normalizedPath else "/$normalizedPath"
        }

        if (resolvedPath == null) {
            return candidateSet.toList()
        }

        for (base in baseCandidates) {
            val pathWithSlash = if (base.endsWith("/")) {
                "$base${resolvedPath.removePrefix("/")}"
            } else {
                "$base$resolvedPath"
            }
            candidateSet.add(appendRecoveryQuery(pathWithSlash, query))
        }
        return candidateSet.toList()
    }

    private fun appendRecoveryQuery(url: String, query: String): String {
        val sep = if (url.contains("?")) "&" else "?"
        return "$url$sep$query"
    }

    private fun ensureBehaviorQuestionSheet(): BottomSheetDialog {
        behaviorQuestionSheet?.let { return it }

        val inflater = LayoutInflater.from(requireContext())
        val view = inflater.inflate(R.layout.behavior_question_bottom_sheet, null)
        behaviorQuestionSheetView = view

        val dialog = BottomSheetDialog(requireContext())
        dialog.setContentView(view)
        dialog.setOnDismissListener {
            behaviorQuestionSheet = null
            behaviorQuestionSheetView = null
        }
        behaviorQuestionSheet = dialog
        return dialog
    }

    private fun showBehaviorQuestionSheet(question: BehaviorQuestionUi?) {
        if (question == null) {
            behaviorQuestionSheet?.dismiss()
            return
        }

        val dialog = ensureBehaviorQuestionSheet()
        val sheetView = behaviorQuestionSheetView ?: return

        val questionText = sheetView.findViewById<TextView>(R.id.behaviorSheetQuestionText)
        val reasonText = sheetView.findViewById<TextView>(R.id.behaviorSheetReasonText)
        val workButton = sheetView.findViewById<Button>(R.id.behaviorSheetWorkButton)
        val restButton = sheetView.findViewById<Button>(R.id.behaviorSheetRestButton)
        val moveButton = sheetView.findViewById<Button>(R.id.behaviorSheetMoveButton)
        val exerciseButton = sheetView.findViewById<Button>(R.id.behaviorSheetExerciseButton)
        val otherButton = sheetView.findViewById<Button>(R.id.behaviorSheetOtherButton)
        val dismissButton = sheetView.findViewById<Button>(R.id.behaviorSheetDismissButton)

        questionText.text = question.questionText
        if (question.triggerReasons.isEmpty()) {
            reasonText.visibility = View.GONE
        } else {
            reasonText.visibility = View.VISIBLE
            reasonText.text = "�ٰ�: ${question.triggerReasons.joinToString(", ")}"
        }

        val isBusy = behaviorQuestionBusy
        val buttons = listOf(workButton, restButton, moveButton, exerciseButton, otherButton, dismissButton)
        buttons.forEach { it.isEnabled = !isBusy }

        if (question.isSoftNudge) {
            workButton.text = "�����ƿ�, ������ �̷���"
            restButton.text = "��� ���߰� ȸ���ҰԿ�"
            moveButton.visibility = View.GONE
            exerciseButton.visibility = View.GONE
            otherButton.visibility = View.GONE
            dismissButton.visibility = View.GONE
            workButton.setOnClickListener {
                dismissPendingBehaviorQuestion()
            }
            restButton.setOnClickListener {
                handleSoftNudgeNeedRecovery()
            }
        } else {
            workButton.text = "�����ƿ�, ���"
            restButton.text = "������ �޽�"
            moveButton.visibility = View.VISIBLE
            exerciseButton.visibility = View.VISIBLE
            otherButton.visibility = View.VISIBLE
            dismissButton.visibility = View.VISIBLE
            workButton.setOnClickListener {
                answerPendingBehaviorQuestion("work")
            }
            restButton.setOnClickListener {
                answerPendingBehaviorQuestion("rest")
            }
            moveButton.setOnClickListener {
                answerPendingBehaviorQuestion("move")
            }
            exerciseButton.setOnClickListener {
                answerPendingBehaviorQuestion("exercise")
            }
            otherButton.setOnClickListener {
                answerPendingBehaviorQuestion("other")
            }
            dismissButton.setOnClickListener {
                dismissPendingBehaviorQuestion()
            }
        }

        if (!dialog.isShowing) {
            dialog.show()
        }
    }

    private fun buildRecoveryBaseCandidates(baseApiUrl: String): List<String> {
        val uri = runCatching { java.net.URI(baseApiUrl) }.getOrNull() ?: return emptyList()
        val scheme = uri.scheme ?: return emptyList()
        val host = uri.host ?: return emptyList()

        val ports = LinkedHashSet<String>()
        if (uri.port > 0) {
            ports.add(uri.port.toString())
        }
        ports.addAll(RECOVERY_WEB_PORT_CANDIDATES)

        return ports.map { port ->
            if (port == "80" && scheme.equals("http", ignoreCase = true)) {
                "$scheme://$host"
            } else if (port == "443" && scheme.equals("https", ignoreCase = true)) {
                "$scheme://$host"
            } else {
                "$scheme://$host:$port"
            }
        }
    }

    private fun isRecoveryUrlReachable(url: String): Boolean {
        return runCatching {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 700
            conn.readTimeout = 700
            conn.instanceFollowRedirects = true
            conn.requestMethod = "GET"
            conn.connect()
            val code = conn.responseCode
            conn.disconnect()
            code in 200..399
        }.getOrDefault(false)
    }

    private fun refreshPendingBehaviorQuestion(manual: Boolean) {
        if (behaviorQuestionBusy) return
        val inputs = collectBehaviorStartInputs(silent = !manual) ?: return
        behaviorQuestionBusy = true
        refreshBehaviorQuestionUi()

        Thread {
            val result = runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )
                val encodedUserId = URLEncoder.encode(inputs.userId, Charsets.UTF_8.name())
                val path = "/api/spec/behavior/questions/pending?user_id=$encodedUserId&limit=1"
                val resp = client.get(path)
                if (resp.statusCode !in 200..299) {
                    throw IllegalStateException("HTTP ${resp.statusCode}: ${resp.body}")
                }
                parsePendingQuestion(resp.body)
            }

            runOnUiThreadSafe {
                behaviorQuestionBusy = false
                result.onSuccess { question ->
                    currentBehaviorQuestion = question
                    showBehaviorQuestionSheet(question)
                    refreshBehaviorQuestionUi()
                    if (manual) {
                        val msg = if (question == null) "No pending question" else "Pending question loaded"
                        toast(msg)
                    }
                }.onFailure { err ->
                    refreshBehaviorQuestionUi()
                    showBehaviorQuestionSheet(null)
                    if (manual) {
                        toast("Question refresh failed: ${err.message ?: "unknown"}")
                    }
                }
            }
        }.start()
    }

    private fun answerPendingBehaviorQuestion(label: String) {
        val question = currentBehaviorQuestion
        if (question == null) {
            toast("No pending question")
            return
        }
        if (behaviorQuestionBusy) return
        val inputs = collectBehaviorStartInputs(silent = false) ?: return

        behaviorQuestionBusy = true
        refreshBehaviorQuestionUi()
        Thread {
            val result = runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )
                val encodedUserId = URLEncoder.encode(inputs.userId, Charsets.UTF_8.name())
                val payload = JSONObject()
                    .put("user_id", inputs.userId)
                    .put("label", label)
                    .toString()
                val path = "/api/spec/behavior/questions/${question.questionId}/answer?user_id=$encodedUserId"
                val resp = client.post(path, payload)
                if (resp.statusCode !in 200..299) {
                    throw IllegalStateException("HTTP ${resp.statusCode}: ${resp.body}")
                }
                val pendingResp = client.get("/api/spec/behavior/questions/pending?user_id=$encodedUserId&limit=1")
                if (pendingResp.statusCode !in 200..299) {
                    throw IllegalStateException("HTTP ${pendingResp.statusCode}: ${pendingResp.body}")
                }
                parsePendingQuestion(pendingResp.body)
            }

            runOnUiThreadSafe {
                behaviorQuestionBusy = false
                result.onSuccess { nextQuestion ->
                    markMeaningfulProgress()
                    currentBehaviorQuestion = nextQuestion
                    showBehaviorQuestionSheet(nextQuestion)
                    refreshBehaviorQuestionUi()
                    toast("Question answered: $label")
                }.onFailure { err ->
                    refreshBehaviorQuestionUi()
                    showBehaviorQuestionSheet(currentBehaviorQuestion)
                    toast("Answer failed: ${err.message ?: "unknown"}")
                }
            }
        }.start()
    }

    private fun dismissPendingBehaviorQuestion() {
        val question = currentBehaviorQuestion
        if (question == null) {
            toast("No pending question")
            return
        }
        if (behaviorQuestionBusy) return
        val inputs = collectBehaviorStartInputs(silent = false) ?: return

        behaviorQuestionBusy = true
        refreshBehaviorQuestionUi()
        Thread {
            val result = runCatching {
                val client = BehaviorApiClient(
                    baseUrl = inputs.baseUrl,
                    accessToken = inputs.accessToken,
                )
                val encodedUserId = URLEncoder.encode(inputs.userId, Charsets.UTF_8.name())
                val dismissPath = "/api/spec/behavior/questions/${question.questionId}/dismiss?user_id=$encodedUserId"
                val dismissResp = client.post(dismissPath, "{}")
                if (dismissResp.statusCode !in 200..299) {
                    throw IllegalStateException("HTTP ${dismissResp.statusCode}: ${dismissResp.body}")
                }
                val pendingResp = client.get("/api/spec/behavior/questions/pending?user_id=$encodedUserId&limit=1")
                if (pendingResp.statusCode !in 200..299) {
                    throw IllegalStateException("HTTP ${pendingResp.statusCode}: ${pendingResp.body}")
                }
                parsePendingQuestion(pendingResp.body)
            }

            runOnUiThreadSafe {
                behaviorQuestionBusy = false
                result.onSuccess { nextQuestion ->
                    markMeaningfulProgress()
                    currentBehaviorQuestion = nextQuestion
                    showBehaviorQuestionSheet(nextQuestion)
                    refreshBehaviorQuestionUi()
                    toast("Question dismissed")
                }.onFailure { err ->
                    refreshBehaviorQuestionUi()
                    showBehaviorQuestionSheet(currentBehaviorQuestion)
                    toast("Dismiss failed: ${err.message ?: "unknown"}")
                }
            }
        }.start()
    }

    private fun parsePendingQuestion(body: String): BehaviorQuestionUi? {
        val arr = runCatching { JSONArray(body) }.getOrNull() ?: return null
        if (arr.length() <= 0) return null
        val obj = arr.optJSONObject(0) ?: return null
        val questionId = obj.optInt("question_id", 0)
        if (questionId <= 0) return null
        val questionText = obj.optString("question_text", "What are you doing right now?")
        val reasons = mutableListOf<String>()
        val reasonArr = obj.optJSONArray("trigger_reasons")
        if (reasonArr != null) {
            for (i in 0 until reasonArr.length()) {
                reasons.add(reasonArr.optString(i))
            }
        }
        val isSoftNudge = reasons.contains(SOFT_NUDGE_TRIGGER_REASON) || questionText == SOFT_NUDGE_QUESTION_TEXT
        return BehaviorQuestionUi(
            questionId = questionId,
            questionText = questionText,
            triggerReasons = reasons,
            isSoftNudge = isSoftNudge,
            recoveryUrl = obj.optString("recovery_url").orEmpty().ifBlank { null },
        )
    }

    private fun refreshBehaviorQuestionUi() {
        val question = currentBehaviorQuestion
        val controlsEnabled = !behaviorQuestionBusy && question != null
        val isSoftNudge = question?.isSoftNudge == true

        behaviorAnswerWorkButton.text = if (isSoftNudge) "�����ƿ�" else "work"
        behaviorAnswerRestButton.text = if (isSoftNudge) "��� ���� �־��" else "rest"

        behaviorRefreshQuestionButton.isEnabled = !behaviorQuestionBusy
        behaviorAnswerWorkButton.isEnabled = controlsEnabled
        behaviorAnswerRestButton.isEnabled = controlsEnabled
        behaviorAnswerMoveButton.isEnabled = controlsEnabled
        behaviorAnswerExerciseButton.isEnabled = controlsEnabled
        behaviorAnswerOtherButton.isEnabled = controlsEnabled
        behaviorDismissQuestionButton.isEnabled = controlsEnabled

        behaviorAnswerMoveButton.visibility = if (isSoftNudge) View.GONE else View.VISIBLE
        behaviorAnswerExerciseButton.visibility = if (isSoftNudge) View.GONE else View.VISIBLE
        behaviorAnswerOtherButton.visibility = if (isSoftNudge) View.GONE else View.VISIBLE
        behaviorDismissQuestionButton.visibility = if (isSoftNudge) View.GONE else View.VISIBLE
        behaviorAnswerWorkButton.visibility = if (question == null) View.GONE else View.VISIBLE
        behaviorAnswerRestButton.visibility = if (question == null) View.GONE else View.VISIBLE

        behaviorQuestionTextView.text = when {
            behaviorQuestionBusy -> "Loading pending behavior question..."
            question == null -> "No pending behavior question"
            else -> {
                val reasonText = if (question.triggerReasons.isEmpty()) {
                    "-"
                } else {
                    question.triggerReasons.joinToString(", ")
                }
                "Q#${question.questionId}: ${question.questionText}\nreasons: $reasonText"
            }
        }
    }

    private fun onDeveloperModeTapped() {
        val now = System.currentTimeMillis()
        if (now - developerModeTapStartAt > DEV_MODE_TAP_WINDOW_MS) {
            developerModeTapCount = 1
            developerModeTapStartAt = now
        } else {
            developerModeTapCount++
        }

        if (developerModeTapCount == DEV_MODE_TAP_TARGET - 1) {
            val remain = DEV_MODE_TAP_TARGET - developerModeTapCount
            toast("������ ������ ${remain}ȸ ���Ҿ��.")
            return
        }

        if (developerModeTapCount >= DEV_MODE_TAP_TARGET) {
            val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!isDeveloperModeEnabled) {
                isDeveloperModeEnabled = true
                prefs.edit().putBoolean(PREF_KEY_DEVELOPER_MODE, true).apply()
                refreshDeveloperModeUi()
                toast("������ ��尡 Ȱ��ȭ�Ǿ����.")
            }
            developerModeTapCount = DEV_MODE_TAP_TARGET
        }
    }

    private fun refreshDeveloperModeUi() {
        val hasUserId = syncUserIdInput.text?.toString()?.trim()?.isNotBlank() == true
        applyDeveloperModeVisibility(hasUserId)
        developerModeHintText.visibility = View.GONE
    }

    private fun refreshGeneralSettingsVisibility() {
        recoveryTimerSection.visibility = if (tabMode == MainTab.MY_PAGE) View.VISIBLE else View.GONE
        usageAccessSection.visibility = View.VISIBLE
        refreshUsageAccessStatusUi()
    }

    private fun getPrefs() =
        requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun isUsageStatsEnabled(): Boolean =
        getPrefs().getBoolean(PREF_KEY_USAGE_STATS_ENABLED, false)

    private fun ensureUsageAccessForFocusStart(): Boolean {
        if (!isUsageStatsEnabled()) return true
        if (isUsageAccessGranted()) return true

        showUsageAccessRequiredForFocusStartDialog()
        return false
    }

    private fun isUsageAccessGranted(): Boolean {
        val appOps = requireContext().getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                requireContext().packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                requireContext().packageName,
            )
        }
        return mode == android.app.AppOpsManager.MODE_ALLOWED
    }

    private fun refreshUsageAccessStatusUi() {
        if (!::usageAccessStatusText.isInitialized) return
        val enabled = isUsageStatsEnabled()
        if (!enabled) {
            usageAccessStatusText.text = getString(R.string.usage_access_status_disabled)
            return
        }
        val granted = isUsageAccessGranted()
        usageAccessStatusText.text = if (granted) {
            getString(R.string.usage_access_status_on)
        } else {
            getString(R.string.usage_access_status_off)
        }
    }

    private fun openUsageAccessSettings() {
        openUsageAccessSettingsSafe()
    }

    private fun openUsageAccessSettingsSafe() {
        if (!isAdded) return
        runCatching {
            startActivity(
                Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure {
            runCatching {
                startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }.onFailure {
                runCatching {
                    startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = Uri.parse("package:" + requireContext().packageName)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        },
                    )
                }
            }
        }
    }

    private fun showUsageAccessPolicyDialog() {
        if (!isAdded) return
        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.usage_access_dialog_title))
            .setMessage(getString(R.string.usage_access_dialog_body))
            .setPositiveButton(getString(R.string.usage_access_dialog_ok), null)
            .show()
    }

    private fun maybePromptUsageAccessOnce() {
        val prefs = getPrefs()
        if (prefs.getBoolean(PREF_KEY_USAGE_ACCESS_PROMPTED, false)) return
        prefs.edit().putBoolean(PREF_KEY_USAGE_ACCESS_PROMPTED, true).apply()

        if (isUsageAccessGranted()) return
        if (!isAdded) return

        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.usage_access_prompt_title))
            .setMessage(getString(R.string.usage_access_prompt_body))
            .setPositiveButton(getString(R.string.usage_access_prompt_open)) { _, _ ->
                openUsageAccessSettingsSafe()
            }
            .setNegativeButton(getString(R.string.usage_access_prompt_later), null)
            .show()
    }

    private fun showUsageAccessRequiredForFocusStartDialog() {
        if (!isAdded) return
        if (usageAccessDialogShowing) return
        usageAccessDialogShowing = true

        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.usage_access_prompt_title))
            .setMessage(getString(R.string.usage_access_required_for_start_body))
            .setPositiveButton(getString(R.string.usage_access_prompt_open)) { _, _ ->
                openUsageAccessSettingsSafe()
            }
            .setNegativeButton(getString(R.string.usage_access_prompt_later), null)
            .setOnDismissListener { usageAccessDialogShowing = false }
            .show()
    }

    private fun runOnUiThreadSafe(action: () -> Unit) {
        if (!isAdded) return
        requireActivity().runOnUiThread {
            if (!isAdded) return@runOnUiThread
            action()
        }
    }

    private fun toast(msg: String) {
        if (!isAdded) return
        Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
    }
}
