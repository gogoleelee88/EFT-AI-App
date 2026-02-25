package com.eft.mobileagent.alarm

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.eft.mobileagent.R

class AlarmActivity : AppCompatActivity() {
    private lateinit var repository: AlarmRepository
    private lateinit var scheduler: AlarmScheduler
    private lateinit var validator: LocationMissionValidator

    private lateinit var alarmMissionText: TextView
    private lateinit var resultText: TextView
    private lateinit var targetText: TextView
    private lateinit var alarmTitleText: TextView
    private lateinit var confirmArrivalButton: Button
    private lateinit var manualDismissButton: Button
    private lateinit var snoozeButton: Button
    private lateinit var alarmNoDismissNote: TextView

    private var alarmId: String? = null
    private var alarm: AlarmJob? = null

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

        alarmTitleText = findViewById(R.id.alarmTitleText)
        alarmMissionText = findViewById(R.id.alarmMissionText)
        targetText = findViewById(R.id.targetText)
        resultText = findViewById(R.id.resultText)
        confirmArrivalButton = findViewById(R.id.confirmArrivalButton)
        manualDismissButton = findViewById(R.id.manualDismissButton)
        snoozeButton = findViewById(R.id.snoozeButton)
        alarmNoDismissNote = findViewById(R.id.alarmNoDismissNote)

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

        bindAlarmUi(alarm!!)
        snoozeButton.setOnClickListener { snoozeAlarm() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val isManual = alarm?.missionType == AlarmMissionType.MANUAL_DISMISS.value
                if (isManual) {
                    toast(getString(R.string.manual_dismiss_note))
                } else {
                    toast(getString(R.string.msg_cannot_dismiss_before_mission))
                }
            }
        })
    }

    private fun bindAlarmUi(job: AlarmJob) {
        alarmTitleText.text = getString(R.string.format_alarm_title, job.label)
        if (job.missionType == AlarmMissionType.MANUAL_DISMISS.value) {
            bindManualDismissUi()
            return
        }
        bindLocationMissionUi(job)
    }

    private fun bindLocationMissionUi(job: AlarmJob) {
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

    private fun bindManualDismissUi() {
        alarmMissionText.text = getString(R.string.manual_mission_title)
        confirmArrivalButton.visibility = View.GONE
        manualDismissButton.visibility = View.VISIBLE
        alarmNoDismissNote.text = getString(R.string.manual_dismiss_note)
        targetText.text = getString(R.string.manual_target_placeholder)
        resultText.text = getString(R.string.manual_result_prompt)
        resultText.setTextColor(Color.parseColor("#E5E7EB"))
        manualDismissButton.setOnClickListener { dismissManualAlarm() }
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

    private fun completeMissionAndDismiss(distanceMeters: Float) {
        val id = alarmId ?: return
        scheduler.cancel(id)
        repository.setLastAlarmId(null)
        AlarmSoundService.stop(this)
        CompletionReporter.reportOnce(this, id, distanceMeters)
        toast(getString(R.string.msg_mission_complete_dismissed))
        finish()
    }

    private fun dismissManualAlarm() {
        val id = alarmId ?: return
        scheduler.cancel(id)
        repository.setLastAlarmId(null)
        AlarmSoundService.stop(this)
        CompletionReporter.reportManualDismiss(this, id)
        toast(getString(R.string.msg_manual_alarm_dismissed))
        finish()
    }

    private fun snoozeAlarm() {
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
        AlarmSoundService.stop(this)
        finish()
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    private companion object {
        private const val SNOOZE_MINUTES = 10
    }
}
