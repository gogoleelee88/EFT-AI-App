package com.eft.mobileagent

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.DatePicker
import android.widget.EditText
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.TimePicker
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.eft.mobileagent.alarm.AlarmMissionType
import com.eft.mobileagent.alarm.AlarmRepository
import com.eft.mobileagent.alarm.AlarmScheduler
import com.eft.mobileagent.alarm.AlarmSourceType
import com.eft.mobileagent.alarm.AlarmJob
import com.eft.mobileagent.alarm.ReminderSyncManager
import com.eft.mobileagent.alarm.TargetLocation
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class MyFragment : Fragment(R.layout.fragment_main_tab) {
    private lateinit var repository: AlarmRepository
    private lateinit var scheduler: AlarmScheduler

    private lateinit var datePicker: DatePicker
    private lateinit var timePicker: TimePicker
    private lateinit var alarmLabelInput: EditText
    private lateinit var sourceTypeGroup: RadioGroup
    private lateinit var sourceServiceRadio: RadioButton
    private lateinit var sourceGoogleRadio: RadioButton
    private lateinit var missionTypeGroup: RadioGroup
    private lateinit var missionLocationRadio: RadioButton
    private lateinit var missionManualRadio: RadioButton
    private lateinit var locationSectionContainer: View
    private lateinit var targetLocationView: TextView
    private lateinit var alarmSummaryView: TextView
    private lateinit var syncServerAlarmsButton: Button
    private lateinit var syncUserIdInput: EditText
    private lateinit var backendBaseUrlInput: EditText

    private val koreaZoneId: ZoneId = ZoneId.of("Asia/Seoul")

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        repository = AlarmRepository(requireContext())
        scheduler = AlarmScheduler(requireContext())

        datePicker = view.findViewById(R.id.datePicker)
        timePicker = view.findViewById(R.id.timePicker)
        alarmLabelInput = view.findViewById(R.id.alarmLabelInput)
        sourceTypeGroup = view.findViewById(R.id.sourceTypeGroup)
        sourceServiceRadio = view.findViewById(R.id.sourceServiceRadio)
        sourceGoogleRadio = view.findViewById(R.id.sourceGoogleRadio)
        missionTypeGroup = view.findViewById(R.id.missionTypeGroup)
        missionLocationRadio = view.findViewById(R.id.missionLocationRadio)
        missionManualRadio = view.findViewById(R.id.missionManualRadio)
        locationSectionContainer = view.findViewById(R.id.locationSectionContainer)
        targetLocationView = view.findViewById(R.id.targetLocationView)
        alarmSummaryView = view.findViewById(R.id.alarmSummaryView)
        syncServerAlarmsButton = view.findViewById(R.id.syncServerAlarmsButton)
        syncUserIdInput = view.findViewById(R.id.syncUserIdInput)
        backendBaseUrlInput = view.findViewById(R.id.backendBaseUrlInput)

        timePicker.setIs24HourView(true)
        initializeDefaults()
        restoreSyncInputs()

        sourceTypeGroup.setOnCheckedChangeListener { _, _ ->
            applySourceRules()
            refreshMissionUi()
        }
        missionTypeGroup.setOnCheckedChangeListener { _, _ ->
            refreshMissionUi()
        }

        view.findViewById<Button>(R.id.scheduleAlarmButton).setOnClickListener { scheduleAlarm() }
        view.findViewById<Button>(R.id.cancelAlarmButton).setOnClickListener { cancelLastAlarm() }
        view.findViewById<Button>(R.id.syncServerAlarmsButton).setOnClickListener { syncServerReminders() }

        syncServerAlarmsButton.visibility = View.VISIBLE

        applySourceRules()
        refreshMissionUi()
        refreshTargetLocationUi()
        refreshAlarmSummaryUi()
    }

    private fun initializeDefaults() {
        sourceServiceRadio.isChecked = true
        missionLocationRadio.isChecked = true
        val todayKst = ZonedDateTime.now(koreaZoneId).toLocalDate()
        datePicker.updateDate(todayKst.year, todayKst.monthValue - 1, todayKst.dayOfMonth)
        datePicker.minDate = todayKst.atStartOfDay(koreaZoneId).toInstant().toEpochMilli()
    }

    private fun restoreSyncInputs() {
        val config = ReminderSyncManager.loadConfig(requireContext())
        val baseUrl = config?.baseUrl ?: BuildConfig.BACKEND_BASE_URL
        val userId = config?.userId.orEmpty()
        backendBaseUrlInput.setText(baseUrl)
        syncUserIdInput.setText(userId)
    }

    private fun selectedSourceType(): AlarmSourceType {
        return if (sourceGoogleRadio.isChecked) AlarmSourceType.GOOGLE else AlarmSourceType.SERVICE
    }

    private fun selectedMissionType(sourceType: AlarmSourceType): AlarmMissionType {
        if (sourceType == AlarmSourceType.GOOGLE) return AlarmMissionType.MANUAL_DISMISS
        return if (missionManualRadio.isChecked) AlarmMissionType.MANUAL_DISMISS else AlarmMissionType.LOCATION_ARRIVAL
    }

    private fun applySourceRules() {
        if (selectedSourceType() == AlarmSourceType.GOOGLE) {
            missionLocationRadio.isEnabled = false
            missionManualRadio.isChecked = true
            return
        }
        missionLocationRadio.isEnabled = true
    }

    private fun refreshMissionUi() {
        val mission = selectedMissionType(selectedSourceType())
        locationSectionContainer.visibility =
            if (mission == AlarmMissionType.LOCATION_ARRIVAL) View.VISIBLE else View.GONE
    }

    private fun scheduleAlarm() {
        val sourceType = selectedSourceType()
        val missionType = selectedMissionType(sourceType)
        val target = repository.getTargetLocation()
        if (missionType == AlarmMissionType.LOCATION_ARRIVAL && target == null) {
            toast(getString(R.string.msg_target_missing))
            return
        }
        if (!ensureExactAlarmPermission()) {
            toast(getString(R.string.msg_exact_alarm_permission_needed))
            return
        }
        val triggerAtMillis = computeTriggerAtMillis() ?: run {
            toast(getString(R.string.msg_alarm_time_past))
            return
        }

        val alarmId = UUID.randomUUID().toString()
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
            missionType = missionType.value,
            sourceType = sourceType.value,
        )
        scheduler.schedule(job)
        repository.setLastAlarmId(alarmId)
        refreshAlarmSummaryUi()
        toast(getString(R.string.msg_alarm_scheduled, formatTime(triggerAtMillis)))
    }

    private fun syncServerReminders() {
        val config = ReminderSyncManager.loadConfig(requireContext()) ?: run {
            toast(getString(R.string.msg_login_required_for_sync))
            return
        }
        syncServerAlarmsButton.isEnabled = false
        Thread {
            val result = runCatching {
                ReminderSyncManager.syncWithSavedConfig(requireContext(), 80)
            }
            requireActivity().runOnUiThread {
                syncServerAlarmsButton.isEnabled = true
                result.onSuccess {
                    refreshAlarmSummaryUi()
                    toast(getString(R.string.msg_sync_success, it.scheduledCount))
                }.onFailure { err ->
                    toast(getString(R.string.msg_sync_failed, err.message ?: "unknown"))
                }
            }
        }.start()
    }

    private fun cancelLastAlarm() {
        val lastId = repository.getLastAlarmId()
        if (lastId.isNullOrBlank()) {
            toast(getString(R.string.msg_no_alarm_to_cancel))
            return
        }
        scheduler.cancel(lastId)
        repository.setLastAlarmId(null)
        refreshAlarmSummaryUi()
        toast(getString(R.string.msg_alarm_cancelled))
    }

    private fun ensureExactAlarmPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val am = requireContext().getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (am.canScheduleExactAlarms()) return true
        runCatching { startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)) }
        return false
    }

    private fun computeTriggerAtMillis(): Long? {
        val hour = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) timePicker.hour else timePicker.currentHour
        val minute = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) timePicker.minute else timePicker.currentMinute
        val pickedDate = LocalDate.of(datePicker.year, datePicker.month + 1, datePicker.dayOfMonth)
        val pickedTime = LocalTime.of(hour, minute)
        val target = ZonedDateTime.of(pickedDate, pickedTime, koreaZoneId)
        val now = ZonedDateTime.now(koreaZoneId)
        if (!target.isAfter(now)) return null
        return target.toInstant().toEpochMilli()
    }

    private fun refreshTargetLocationUi() {
        val target = repository.getTargetLocation()
        targetLocationView.text = if (target == null) {
            getString(R.string.target_location_not_set)
        } else {
            getString(R.string.format_target_location, target.latitude, target.longitude, target.radiusMeters)
        }
    }

    private fun refreshAlarmSummaryUi() {
        val alarm = repository.getLastAlarmId()?.let { repository.getAlarm(it) }
        alarmSummaryView.text = if (alarm == null || !alarm.enabled) {
            getString(R.string.summary_no_active_alarm)
        } else {
            val missionLabel = if (alarm.missionType == AlarmMissionType.MANUAL_DISMISS.value) {
                getString(R.string.label_manual_mission_short)
            } else {
                getString(R.string.label_location_mission_short)
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

    private fun toast(msg: String) {
        Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
    }
}
