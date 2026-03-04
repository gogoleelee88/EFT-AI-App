package com.eft.mobileagent.behavior

import com.eft.mobileagent.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

data class BehaviorAgentConfig(
    val backendBaseUrl: String,
    val userId: String?,
    val accessToken: String?,
)

class BehaviorAgentConfigStore(private val context: android.content.Context) {
    private val prefs = context.getSharedPreferences(SYNC_PREF_NAME, android.content.Context.MODE_PRIVATE)
    private val legacyPrefs = context.getSharedPreferences(LEGACY_SYNC_PREF_NAME, android.content.Context.MODE_PRIVATE)

    fun load(): BehaviorAgentConfig {
        val rawUrl = prefs.getString(KEY_SYNC_BASE_URL, null)?.trim()?.ifBlank { null }
            ?: legacyPrefs.getString(KEY_SYNC_BASE_URL, null)?.trim()?.ifBlank { null }
            ?: BuildConfig.BACKEND_BASE_URL
        val normalized = normalizeBaseUrl(rawUrl)
        val defaultBaseUrl = normalizeBaseUrl(BuildConfig.BACKEND_BASE_URL)
        val effectiveBaseUrl = preferPublicBackend(normalized, defaultBaseUrl)

        if (effectiveBaseUrl != normalized) {
            prefs.edit().putString(KEY_SYNC_BASE_URL, effectiveBaseUrl).apply()
        }

        val uid = prefs.getString(KEY_SYNC_USER_ID, null)?.trim()?.takeIf { it.isNotEmpty() }
            ?: legacyPrefs.getString(KEY_SYNC_USER_ID, null)?.trim()?.takeIf { it.isNotEmpty() }
        val token = prefs.getString(KEY_BEHAVIOR_ACCESS_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }
            ?: legacyPrefs.getString(KEY_BEHAVIOR_ACCESS_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }
        return BehaviorAgentConfig(
            backendBaseUrl = effectiveBaseUrl,
            userId = uid,
            accessToken = token,
        )
    }

    private fun normalizeBaseUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed.removeSuffix("/")
        }
        return "http://${trimmed.removeSuffix("/")}"
    }

    private fun preferPublicBackend(currentBaseUrl: String, fallbackBaseUrl: String): String {
        val currentHost = runCatching { URI(currentBaseUrl).host?.lowercase().orEmpty() }.getOrDefault("")
        val fallbackHost = runCatching { URI(fallbackBaseUrl).host?.lowercase().orEmpty() }.getOrDefault("")
        if (currentHost.isBlank() || fallbackHost.isBlank()) return currentBaseUrl

        if (isLocalOrPrivateHost(currentHost) && !isLocalOrPrivateHost(fallbackHost)) {
            return fallbackBaseUrl
        }
        return currentBaseUrl
    }

    private fun isLocalOrPrivateHost(host: String): Boolean {
        val h = host.trim().lowercase()
        if (h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "0.0.0.0") return true
        if (h.startsWith("10.")) return true
        if (h.startsWith("192.168.")) return true
        if (h.startsWith("169.254.")) return true
        if (h.startsWith("172.")) {
            val secondOctet = h.split(".").getOrNull(1)?.toIntOrNull()
            if (secondOctet != null && secondOctet in 16..31) return true
        }
        return false
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
        private const val SYNC_PREF_NAME = "mobile_agent_sync"
        private const val KEY_SYNC_BASE_URL = "backend_base_url"
        private const val KEY_SYNC_USER_ID = "sync_user_id"
        private const val KEY_BEHAVIOR_ACCESS_TOKEN = "behavior_access_token"
        private const val LEGACY_SYNC_PREF_NAME = "alarm_agent_sync"
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
