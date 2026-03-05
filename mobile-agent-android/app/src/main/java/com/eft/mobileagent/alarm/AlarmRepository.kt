package com.eft.mobileagent.alarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class AlarmRepository(context: Context) {
    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun upsertAlarm(job: AlarmJob) {
        val jobs = loadJobs().toMutableList()
        val idx = jobs.indexOfFirst { it.alarmId == job.alarmId }
        if (idx >= 0) {
            jobs[idx] = job
        } else {
            jobs.add(job)
        }
        saveJobs(jobs)
    }

    fun getAlarm(alarmId: String): AlarmJob? {
        return loadJobs().firstOrNull { it.alarmId == alarmId }
    }

    fun getAllActiveAlarms(): List<AlarmJob> {
        return loadJobs().filter { it.enabled }
    }

    fun disableAlarm(alarmId: String) {
        val jobs = loadJobs().map {
            if (it.alarmId == alarmId) it.copy(enabled = false) else it
        }
        saveJobs(jobs)
    }

    fun setLastAlarmId(alarmId: String?) {
        prefs.edit().putString(KEY_LAST_ALARM_ID, alarmId).apply()
    }

    fun getLastAlarmId(): String? {
        return prefs.getString(KEY_LAST_ALARM_ID, null)
    }

    fun setTargetLocation(target: TargetLocation) {
        val json = JSONObject()
            .put("latitude", target.latitude)
            .put("longitude", target.longitude)
            .put("radiusMeters", target.radiusMeters.toDouble())
        prefs.edit().putString(KEY_TARGET_LOCATION, json.toString()).apply()
    }

    fun getTargetLocation(): TargetLocation? {
        val raw = prefs.getString(KEY_TARGET_LOCATION, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            TargetLocation(
                latitude = json.getDouble("latitude"),
                longitude = json.getDouble("longitude"),
                radiusMeters = json.optDouble("radiusMeters", TargetLocation.DEFAULT_RADIUS_METERS.toDouble()).toFloat(),
            )
        }.getOrNull()
    }

    fun markCompletionReported(alarmId: String) {
        prefs.edit().putBoolean("$KEY_REPORTED_PREFIX$alarmId", true).apply()
    }

    fun isCompletionReported(alarmId: String): Boolean {
        return prefs.getBoolean("$KEY_REPORTED_PREFIX$alarmId", false)
    }

    private fun loadJobs(): List<AlarmJob> {
        val raw = prefs.getString(KEY_ALARMS, null) ?: return emptyList()
        return runCatching {
            val out = mutableListOf<AlarmJob>()
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                out += AlarmJob(
                    alarmId = item.getString("alarmId"),
                    triggerAtMillis = item.getLong("triggerAtMillis"),
                    label = item.optString("label", "미션 알람"),
                    targetLatitude = if (item.has("targetLatitude") && !item.isNull("targetLatitude")) {
                        item.optDouble("targetLatitude")
                    } else {
                        null
                    },
                    targetLongitude = if (item.has("targetLongitude") && !item.isNull("targetLongitude")) {
                        item.optDouble("targetLongitude")
                    } else {
                        null
                    },
                    radiusMeters = item.optDouble("radiusMeters", TargetLocation.DEFAULT_RADIUS_METERS.toDouble()).toFloat(),
                    planDate = item.optString("planDate", ""),
                    taskUid = item.optString("taskUid", ""),
                    missionType = item.optString("missionType", AlarmMissionType.LOCATION_ARRIVAL.value),
                    sourceType = item.optString("sourceType", AlarmSourceType.SERVICE.value),
                    enabled = item.optBoolean("enabled", true),
                )
            }
            out.toList()
        }.getOrElse { emptyList() }
    }

    private fun saveJobs(jobs: List<AlarmJob>) {
        val arr = JSONArray()
        jobs.forEach { job ->
            arr.put(
                JSONObject()
                    .put("alarmId", job.alarmId)
                    .put("triggerAtMillis", job.triggerAtMillis)
                    .put("label", job.label)
                    .put("targetLatitude", job.targetLatitude)
                    .put("targetLongitude", job.targetLongitude)
                    .put("radiusMeters", job.radiusMeters.toDouble())
                    .put("planDate", job.planDate)
                    .put("taskUid", job.taskUid)
                    .put("missionType", job.missionType)
                    .put("sourceType", job.sourceType)
                    .put("enabled", job.enabled)
            )
        }
        prefs.edit().putString(KEY_ALARMS, arr.toString()).apply()
    }

    companion object {
        private const val PREF_NAME = "alarm_agent_store"
        private const val KEY_ALARMS = "alarm_jobs"
        private const val KEY_TARGET_LOCATION = "target_location"
        private const val KEY_LAST_ALARM_ID = "last_alarm_id"
        private const val KEY_REPORTED_PREFIX = "completion_reported_"
    }
}
