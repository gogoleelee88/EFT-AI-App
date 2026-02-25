package com.eft.mobileagent.behavior

import com.eft.mobileagent.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class BehaviorAgentConfig(
    val backendBaseUrl: String,
    val userId: String?,
    val accessToken: String?,
)

class BehaviorAgentConfigStore(private val context: android.content.Context) {
    private val prefs = context.getSharedPreferences(SYNC_PREF_NAME, android.content.Context.MODE_PRIVATE)

    fun load(): BehaviorAgentConfig {
        val rawUrl = prefs.getString(KEY_SYNC_BASE_URL, BuildConfig.BACKEND_BASE_URL).orEmpty().trim()
        val normalized = if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            rawUrl.removeSuffix("/")
        } else {
            "http://${rawUrl.removeSuffix("/")}"
        }
        val uid = prefs.getString(KEY_SYNC_USER_ID, null)?.trim()?.takeIf { it.isNotEmpty() }
        val token = prefs.getString(KEY_BEHAVIOR_ACCESS_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }
        return BehaviorAgentConfig(
            backendBaseUrl = normalized,
            userId = uid,
            accessToken = token,
        )
    }

    fun loadAccessToken(): String? {
        return prefs.getString(KEY_BEHAVIOR_ACCESS_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }
    }

    fun saveAccessToken(token: String?) {
        val normalized = token?.trim()?.takeIf { it.isNotEmpty() }
        prefs.edit().putString(KEY_BEHAVIOR_ACCESS_TOKEN, normalized).apply()
    }

    companion object {
        // Reuse existing MainActivity sync prefs to avoid duplicate setup UI.
        private const val SYNC_PREF_NAME = "alarm_agent_sync"
        private const val KEY_SYNC_BASE_URL = "backend_base_url"
        private const val KEY_SYNC_USER_ID = "sync_user_id"
        private const val KEY_BEHAVIOR_ACCESS_TOKEN = "behavior_access_token"
    }
}

data class BehaviorApiResponse(
    val statusCode: Int,
    val body: String,
)

class BehaviorApiClient(
    baseUrl: String,
    private val accessToken: String?,
) {
    private val normalizedBaseUrl = baseUrl.trim().removeSuffix("/")

    fun post(path: String, payload: String): BehaviorApiResponse {
        return request(
            method = "POST",
            path = path,
            payload = payload,
        )
    }

    fun get(path: String): BehaviorApiResponse {
        return request(
            method = "GET",
            path = path,
            payload = null,
        )
    }

    private fun request(
        method: String,
        path: String,
        payload: String?,
    ): BehaviorApiResponse {
        val url = URL("$normalizedBaseUrl${normalizePath(path)}")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (!accessToken.isNullOrBlank()) {
                setRequestProperty("Cookie", "access_token=$accessToken")
            }
            if (payload != null) {
                doOutput = true
            }
        }

        return try {
            if (payload != null) {
                conn.outputStream.use { os ->
                    os.write(payload.toByteArray(Charsets.UTF_8))
                }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            BehaviorApiResponse(statusCode = code, body = text)
        } finally {
            conn.disconnect()
        }
    }

    private fun normalizePath(path: String): String {
        if (path.isBlank()) return "/"
        return if (path.startsWith("/")) path else "/$path"
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 8_000
    }
}
