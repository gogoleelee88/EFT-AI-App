package com.eft.mobileagent.alarm

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.eft.mobileagent.R
import com.eft.mobileagent.behavior.BehaviorApiClient
import com.eft.mobileagent.behavior.BehaviorAgentConfigStore
import com.eft.mobileagent.recovery.EftStrictIntakeBottomSheet
import com.eft.mobileagent.recovery.EftStrictIntakeChatBottomSheet
import org.json.JSONObject
import java.io.File

class AlarmActivity : AppCompatActivity(), EftStrictIntakeChatBottomSheet.Listener {
    private lateinit var repository: AlarmRepository
    private lateinit var scheduler: AlarmScheduler
    private lateinit var validator: LocationMissionValidator
    private lateinit var behaviorConfigStore: BehaviorAgentConfigStore

    private lateinit var alarmMissionText: TextView
    private lateinit var resultText: TextView
    private lateinit var targetText: TextView
    private lateinit var alarmTitleText: TextView
    private lateinit var confirmArrivalButton: Button
    private lateinit var manualDismissButton: Button
    private lateinit var snoozeButton: Button
    private lateinit var alarmNoDismissNote: TextView
    private lateinit var procrastinationCard: View
    private lateinit var handleResistanceButton: Button
    private lateinit var skipResistanceButton: Button

    private var alarmId: String? = null
    private var alarm: AlarmJob? = null
    private val uiHandler = Handler(Looper.getMainLooper())
    private var alarmShownAt: Long = 0L
    private var missionCompletedOrDismissed: Boolean = false
    private var missionCountDown: CountDownTimer? = null
    private var photoGatePassed = false
    private var photoCaptured = false
    private var pendingPhotoFile: File? = null
    private var pendingPhotoUri: Uri? = null

    private data class RecoveryInterventionUi(
        val action: String,
        val entrySentence: String?,
    )

    private val takePictureLauncher =
        registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
            if (ok) {
                onPhotoCaptured()
            } else {
                resultText.text = "Photo capture canceled."
                resultText.setTextColor(Color.parseColor("#F87171"))
            }
        }

    private val requestLocationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (granted) {
                runLocationMissionCheck()
            } else {
                toast(getString(R.string.msg_location_permission_required))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_alarm)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
        )

        repository = AlarmRepository(this)
        scheduler = AlarmScheduler(this)
        validator = LocationMissionValidator(this)
        behaviorConfigStore = BehaviorAgentConfigStore(this)

        alarmTitleText = findViewById(R.id.alarmTitleText)
        alarmMissionText = findViewById(R.id.alarmMissionText)
        targetText = findViewById(R.id.targetText)
        resultText = findViewById(R.id.resultText)
        confirmArrivalButton = findViewById(R.id.confirmArrivalButton)
        manualDismissButton = findViewById(R.id.manualDismissButton)
        snoozeButton = findViewById(R.id.snoozeButton)
        alarmNoDismissNote = findViewById(R.id.alarmNoDismissNote)
        procrastinationCard = findViewById(R.id.procrastinationCard)
        handleResistanceButton = findViewById(R.id.handleResistanceButton)
        skipResistanceButton = findViewById(R.id.skipResistanceButton)

        alarmId = intent.getStringExtra(AlarmReceiver.EXTRA_ALARM_ID)
        if (alarmId.isNullOrBlank()) {
            finishSafely()
            return
        }
        alarm = repository.getAlarm(alarmId!!)
        if (alarm == null || alarm?.enabled != true) {
            finishSafely()
            return
        }

        render(alarm!!)
        snoozeButton.setOnClickListener { snoozeAlarm() }
        alarmShownAt = System.currentTimeMillis()
        uiHandler.postDelayed({ maybeShowProcrastinationCard() }, PROCRASTINATION_TIMEOUT_MS)
        handleResistanceButton.setOnClickListener { openRecoveryChoiceForAlarm() }
        skipResistanceButton.setOnClickListener { snoozeAlarm() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val missionType = alarm?.missionType
                val isManualLike =
                    missionType == AlarmMissionType.MANUAL_DISMISS.value ||
                        missionType == AlarmMissionType.TIME_CHECK.value
                if (isManualLike) {
                    toast(getString(R.string.manual_dismiss_note))
                } else {
                    toast(getString(R.string.msg_cannot_dismiss_before_mission))
                }
            }
        })
    }

    override fun onDestroy() {
        uiHandler.removeCallbacksAndMessages(null)
        missionCountDown?.cancel()
        missionCountDown = null
        cleanupPendingPhotoFile()
        super.onDestroy()
    }

    private fun render(job: AlarmJob) {
        alarmTitleText.text = getString(R.string.format_alarm_title, job.label)
        resetViews()

        when (job.missionType) {
            AlarmMissionType.LOCATION_ARRIVAL.value -> renderLocation(job)
            AlarmMissionType.PHOTO.value -> renderPhoto(job)
            AlarmMissionType.TIME_CHECK.value,
            AlarmMissionType.MANUAL_DISMISS.value -> renderManual(job)
            else -> renderManual(job)
        }
    }

    private fun resetViews() {
        missionCountDown?.cancel()
        missionCountDown = null

        photoGatePassed = false
        photoCaptured = false
        cleanupPendingPhotoFile()

        confirmArrivalButton.visibility = View.GONE
        manualDismissButton.visibility = View.GONE
        alarmNoDismissNote.visibility = View.VISIBLE
        targetText.visibility = View.VISIBLE
        resultText.visibility = View.VISIBLE

        confirmArrivalButton.text = getString(R.string.confirm_arrival)
        confirmArrivalButton.isEnabled = true
        manualDismissButton.text = getString(R.string.manual_dismiss)
        manualDismissButton.isEnabled = true

        confirmArrivalButton.setOnClickListener(null)
        manualDismissButton.setOnClickListener(null)

        targetText.text = ""
        resultText.text = ""
        resultText.setTextColor(Color.parseColor("#E5E7EB"))
        alarmNoDismissNote.text = ""
    }

    private fun renderLocation(job: AlarmJob) {
        alarmMissionText.text = getString(R.string.location_mission_title)
        confirmArrivalButton.visibility = View.VISIBLE
        manualDismissButton.visibility = View.GONE
        alarmNoDismissNote.text = getString(R.string.alarm_no_dismiss_note)

        val lat = job.targetLatitude
        val lng = job.targetLongitude
        targetText.text = if (lat == null || lng == null) {
            getString(R.string.target_location_not_set)
        } else {
            getString(R.string.format_target_alarm, lat, lng, job.radiusMeters)
        }
        resultText.text = getString(R.string.msg_location_prompt)
        resultText.setTextColor(Color.parseColor("#FBBF24"))
        confirmArrivalButton.setOnClickListener { ensureLocationPermissionThenCheck() }
    }

    private fun renderManual(@Suppress("UNUSED_PARAMETER") job: AlarmJob) {
        alarmMissionText.text = getString(R.string.manual_mission_title)
        confirmArrivalButton.visibility = View.GONE
        manualDismissButton.visibility = View.VISIBLE
        alarmNoDismissNote.text = getString(R.string.manual_dismiss_note)
        targetText.text = getString(R.string.manual_target_placeholder)
        resultText.text = getString(R.string.manual_result_prompt)
        resultText.setTextColor(Color.parseColor("#E5E7EB"))
        manualDismissButton.setOnClickListener { dismissManualAlarm() }
    }

    private fun renderPhoto(job: AlarmJob) {
        // Buffer to reduce server-side too_early due to clock/network variance.
        val minSeconds = 12

        alarmMissionText.text = "Mission: photo proof"
        confirmArrivalButton.visibility = View.VISIBLE
        manualDismissButton.visibility = View.VISIBLE
        confirmArrivalButton.text = "Take photo"
        manualDismissButton.text = "Upload & dismiss"
        confirmArrivalButton.isEnabled = false
        manualDismissButton.isEnabled = false
        alarmNoDismissNote.text = "Photo upload verification is required."
        targetText.text = "Take one photo after the timer."
        resultText.text = "Photo unlock in ${minSeconds}s"
        resultText.setTextColor(Color.parseColor("#FBBF24"))

        startTimeGateCountdown(
            minSeconds = minSeconds,
            onTickText = { remain -> "Photo unlock in ${remain}s" },
        ) {
            photoGatePassed = true
            resultText.text = "Take a photo first."
            resultText.setTextColor(Color.parseColor("#E5E7EB"))
            confirmArrivalButton.isEnabled = true
            refreshPhotoUploadButtonState()
        }

        confirmArrivalButton.setOnClickListener {
            runCatching {
                cleanupPendingPhotoFile()
                val tempFile = File.createTempFile("mission_proof_", ".jpg", cacheDir)
                val photoUri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", tempFile)
                pendingPhotoFile = tempFile
                pendingPhotoUri = photoUri
                takePictureLauncher.launch(photoUri)
            }.onFailure {
                resultText.text = "Failed to open camera."
                resultText.setTextColor(Color.parseColor("#F87171"))
            }
        }

        manualDismissButton.setOnClickListener {
            val photoFile = pendingPhotoFile
            if (!photoGatePassed || !photoCaptured || photoFile == null || !photoFile.exists()) {
                resultText.text = "Take a photo before upload."
                resultText.setTextColor(Color.parseColor("#F87171"))
                return@setOnClickListener
            }

            val proofClient = buildMissionProofClientOrNull()
            if (proofClient == null || job.planDate.isBlank() || job.taskUid.isBlank()) {
                completeMissionAndDismiss(0f)
                return@setOnClickListener
            }

            confirmArrivalButton.isEnabled = false
            manualDismissButton.isEnabled = false
            resultText.text = "Uploading proof..."
            resultText.setTextColor(Color.parseColor("#E5E7EB"))

            Thread {
                val ok = runCatching {
                    proofClient.submitPhoto(
                        planDate = job.planDate,
                        taskUid = job.taskUid,
                        minSeconds = minSeconds,
                        imageFile = photoFile,
                    )
                }.getOrDefault(false)
                runOnUiThread {
                    if (ok) {
                        // Keep failed uploads for retry, but remove successful temp file.
                        runCatching { photoFile.delete() }
                        completeMissionAndDismiss(0f)
                    } else {
                        confirmArrivalButton.isEnabled = true
                        refreshPhotoUploadButtonState()
                        resultText.text = "Upload failed. Try again."
                        resultText.setTextColor(Color.parseColor("#F87171"))
                    }
                }
            }.start()
        }
    }

    private fun ensureLocationPermissionThenCheck() {
        val hasFine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            runLocationMissionCheck()
            return
        }
        requestLocationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            )
        )
    }

    private fun runLocationMissionCheck() {
        val job = alarm ?: return
        val targetLat = job.targetLatitude
        val targetLng = job.targetLongitude
        if (targetLat == null || targetLng == null) {
            resultText.text = getString(R.string.target_location_not_set)
            resultText.setTextColor(Color.parseColor("#F87171"))
            return
        }
        confirmArrivalButton.isEnabled = false
        resultText.text = getString(R.string.msg_checking_location)
        resultText.setTextColor(Color.parseColor("#E5E7EB"))

        val target = TargetLocation(
            latitude = targetLat,
            longitude = targetLng,
            radiusMeters = job.radiusMeters,
        )
        validator.validateArrival(target) { validation ->
            runOnUiThread {
                confirmArrivalButton.isEnabled = true
                if (validation.withinRadius) {
                    resultText.text = getString(R.string.msg_mission_success, validation.distanceMeters)
                    resultText.setTextColor(Color.parseColor("#10B981"))
                    completeMissionAndDismiss(validation.distanceMeters)
                } else {
                    val msg = validation.message ?: getString(R.string.msg_location_retry_failed)
                    resultText.text = msg
                    resultText.setTextColor(Color.parseColor("#F87171"))
                }
            }
        }
    }

    private fun startTimeGateCountdown(
        minSeconds: Int,
        onTickText: (remainSeconds: Long) -> String = { remain -> "Verifiable in ${remain}s" },
        onReady: () -> Unit,
    ) {
        missionCountDown?.cancel()
        missionCountDown = object : CountDownTimer((minSeconds * 1000L), 250L) {
            override fun onTick(millisUntilFinished: Long) {
                val remain = (millisUntilFinished / 1000L) + 1L
                resultText.text = onTickText(remain)
            }

            override fun onFinish() {
                onReady()
            }
        }.start()
    }

    private fun buildMissionProofClientOrNull(): MissionProofClient? {
        val config = ReminderSyncManager.loadConfig(this) ?: return null
        val token = behaviorConfigStore.loadAccessToken()?.trim()?.ifBlank { null } ?: return null
        return MissionProofClient(baseUrl = config.baseUrl, accessToken = token)
    }

    private fun onPhotoCaptured() {
        photoCaptured = true
        pendingPhotoUri = null
        resultText.text = if (photoGatePassed) {
            "Photo captured. Upload to verify."
        } else {
            "Photo captured. Wait for timer."
        }
        resultText.setTextColor(Color.parseColor("#E5E7EB"))
        refreshPhotoUploadButtonState()
    }

    private fun refreshPhotoUploadButtonState() {
        manualDismissButton.isEnabled = photoGatePassed && photoCaptured
    }

    private fun cleanupPendingPhotoFile() {
        pendingPhotoUri = null
        val toDelete = pendingPhotoFile
        pendingPhotoFile = null
        if (toDelete != null && toDelete.exists()) {
            runCatching { toDelete.delete() }
        }
    }

    private fun maybeShowProcrastinationCard() {
        if (isFinishing || isDestroyed) return
        if (missionCompletedOrDismissed) return
        procrastinationCard.visibility = View.VISIBLE
    }

    private fun openRecoveryChoiceForAlarm() {
        val job = alarm ?: return
        val config = ReminderSyncManager.loadConfig(this)
        if (config == null) {
            toast(getString(R.string.msg_need_login_for_recovery))
            return
        }

        val elapsedMin = ((System.currentTimeMillis() - alarmShownAt) / 60_000L).toInt().coerceAtLeast(1)
        val accessToken = behaviorConfigStore.loadAccessToken()?.trim()?.ifBlank { null }

        Thread {
            val intervention = runCatching {
                val client = BehaviorApiClient(baseUrl = config.baseUrl, accessToken = accessToken)
                val payload = JSONObject()
                    .put("user_id", config.userId)
                    .put("session_state", "start")
                    .put("entry_point", "schedule_start")
                    .put("schedule_name", job.label)
                    .put("blocked_min", elapsedMin)
                    .put("confidence", 0.66)
                    .put("source", "android_alarm_timeout")
                val resp = client.post("/api/spec/recovery/events", payload.toString())
                if (resp.statusCode !in 200..299) return@runCatching null
                val obj = JSONObject(resp.body)
                RecoveryInterventionUi(
                    action = obj.optString("action", "ignore").ifBlank { "ignore" },
                    entrySentence = obj.optString("entry_sentence").trim().ifBlank { null },
                )
            }.getOrNull()

            runOnUiThread {
                if (intervention?.action == "open_web") {
                    showStrictIntakeChatBottomSheet(
                        sessionId = alarmId ?: "android_alarm_${System.currentTimeMillis()}",
                        userId = config.userId,
                        entryPoint = "schedule_start",
                        scheduleName = job.label,
                        focusSessionId = null,
                        distractionType = "alarm_timeout",
                        blockedMin = elapsedMin,
                        entrySentence = intervention.entrySentence,
                    )
                } else {
                    toast("Recovery action unavailable")
                }
            }
        }.start()
    }
    private fun completeMissionAndDismiss(distanceMeters: Float) {
        missionCompletedOrDismissed = true
        missionCountDown?.cancel()
        missionCountDown = null
        cleanupPendingPhotoFile()
        val id = alarmId ?: return
        scheduler.cancel(id)
        repository.setLastAlarmId(null)
        AlarmSoundService.stop(this)
        CompletionReporter.reportOnce(this, id, distanceMeters)
        toast(getString(R.string.msg_mission_complete_dismissed))
        finish()
    }

    private fun dismissManualAlarm() {
        missionCompletedOrDismissed = true
        missionCountDown?.cancel()
        missionCountDown = null
        cleanupPendingPhotoFile()
        val id = alarmId ?: return
        scheduler.cancel(id)
        repository.setLastAlarmId(null)
        AlarmSoundService.stop(this)
        CompletionReporter.reportManualDismiss(this, id)
        toast(getString(R.string.msg_manual_alarm_dismissed))
        finish()
    }

    private fun snoozeAlarm() {
        missionCompletedOrDismissed = true
        missionCountDown?.cancel()
        missionCountDown = null
        cleanupPendingPhotoFile()
        val job = alarm ?: return
        val now = System.currentTimeMillis()
        val newId = "${job.alarmId}_snooze_$now"
        val snoozeAt = now + SNOOZE_MINUTES * 60 * 1000L

        val snoozed = job.copy(
            alarmId = newId,
            triggerAtMillis = snoozeAt,
            enabled = true,
        )

        scheduler.schedule(snoozed)
        repository.setLastAlarmId(newId)
        scheduler.cancel(job.alarmId)
        AlarmSoundService.stop(this)
        toast(getString(R.string.msg_alarm_snoozed, SNOOZE_MINUTES))
        finish()
    }

    private fun finishSafely() {
        missionCountDown?.cancel()
        missionCountDown = null
        cleanupPendingPhotoFile()
        AlarmSoundService.stop(this)
        finish()
    }

    private fun showStrictIntakeChatBottomSheet(
        sessionId: String,
        userId: String?,
        entryPoint: String?,
        scheduleName: String?,
        focusSessionId: String?,
        distractionType: String?,
        blockedMin: Int?,
        entrySentence: String?,
    ) {
        if (isFinishing || isDestroyed) return
        val fm = supportFragmentManager
        if (fm.isStateSaved) return
        if (fm.findFragmentByTag(STRICT_CHAT_SHEET_TAG) != null) return
        EftStrictIntakeChatBottomSheet.newInstance(
            sessionId = sessionId,
            userId = userId,
            entryPoint = entryPoint,
            scheduleName = scheduleName,
            focusSessionId = focusSessionId,
            distractionType = distractionType,
            blockedMin = blockedMin,
            entrySentence = entrySentence,
        ).show(fm, STRICT_CHAT_SHEET_TAG)
    }

    override fun onStrictIntakeSubmit(payload: EftStrictIntakeBottomSheet.StrictIntakePayload) {
        val syncConfig = ReminderSyncManager.loadConfig(this)
        val stored = behaviorConfigStore.load()
        val baseUrl = syncConfig?.baseUrl ?: stored.backendBaseUrl
        val accessToken = behaviorConfigStore.loadAccessToken()?.trim()?.ifBlank { null } ?: stored.accessToken

        val body = JSONObject()
            .put("session_id", payload.sessionId)
            .put("session_type", payload.sessionType.ifBlank { "eftar" })
            .put("core_emotion", payload.coreEmotion)
            .put("situation_context", payload.situationContext)
            .put("automatic_thought", payload.automaticThought)
            .put("intensity_before", payload.intensityBefore)

        payload.userId?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("user_id", it) }
        payload.physicalSensation?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("physical_sensation", it) }
        payload.copingAttempt?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("coping_attempt", it) }
        payload.immediateGoal?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("immediate_goal", it) }

        Thread {
            val resp = runCatching {
                val client = BehaviorApiClient(baseUrl = baseUrl, accessToken = accessToken)
                client.post("/api/emotion/checkin", body.toString())
            }.getOrNull()

            runOnUiThread {
                if (resp == null || resp.statusCode !in 200..299) {
                    toast("Strict intake save failed")
                }
            }
        }.start()
    }

    override fun onStrictIntakeCancelled() {
        // no-op: user dismissed the strict intake sheet
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    private companion object {
        private const val SNOOZE_MINUTES = 10
        private const val PROCRASTINATION_TIMEOUT_MS = 90_000L
        private const val STRICT_CHAT_SHEET_TAG = "EftStrictIntakeChatBottomSheet"
    }
}
