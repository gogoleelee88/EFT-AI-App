package com.eft.mobileagent.alarm

import android.content.Context
import android.os.Build
import com.eft.mobileagent.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.OffsetDateTime
import java.util.concurrent.Executors

object CompletionReporter {
    private val executor = Executors.newSingleThreadExecutor()

    fun reportOnce(
        context: Context,
        alarmId: String,
        distanceMeters: Float,
    ) {
        val repository = AlarmRepository(context)
        if (repository.isCompletionReported(alarmId)) return

        executor.execute {
            runCatching {
                val ok = postMetrics(
                    JSONObject()
                        .put("type", "local_alarm_location_dismissed")
                        .put("alarm_id", alarmId)
                        .put("distance_m", distanceMeters)
                        .put("platform", "android")
                        .put("sdk_int", Build.VERSION.SDK_INT)
                        .put("at", OffsetDateTime.now().toString())
                )
                if (ok) {
                    repository.markCompletionReported(alarmId)
                }
            }
        }
    }

    fun reportManualDismiss(
        context: Context,
        alarmId: String,
    ) {
        val repository = AlarmRepository(context)
        if (repository.isCompletionReported(alarmId)) return

        executor.execute {
            runCatching {
                val ok = postMetrics(
                    JSONObject()
                        .put("type", "local_alarm_manual_dismissed")
                        .put("alarm_id", alarmId)
                        .put("platform", "android")
                        .put("sdk_int", Build.VERSION.SDK_INT)
                        .put("at", OffsetDateTime.now().toString())
                )
                if (ok) {
                    repository.markCompletionReported(alarmId)
                }
            }
        }
    }

    private fun postMetrics(payload: JSONObject): Boolean {
        val endpoint = "${BuildConfig.BACKEND_BASE_URL}${BuildConfig.COMPLETION_EVENT_PATH}"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 3000
            readTimeout = 3000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        return try {
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            conn.responseCode in 200..299
        } finally {
            conn.disconnect()
        }
    }
}
