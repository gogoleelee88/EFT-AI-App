package com.eft.mobileagent.calendar

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class GoogleCalendarConnectionState(
    val connected: Boolean,
    val status: String?,
)

class CalendarOverlayApiClient(baseUrl: String) {
    private val normalizedBaseUrl = baseUrl.trim().removeSuffix("/")

    fun fetchGoogleEvents(
        dateIso: String,
        accessToken: String?,
    ): List<JSONObject> {
        val encoded = URLEncoder.encode(dateIso, Charsets.UTF_8.name())
        val (statusCode, body) = get(
            path = "/api/spec/google/mobile/events?date=$encoded",
            accessToken = accessToken,
        )
        if (statusCode !in 200..299) {
            throw IllegalStateException("HTTP $statusCode: $body")
        }
        val json = JSONObject(body)
        return json.optJSONArray("events").toJsonObjectList()
    }

    fun fetchServicePlanItems(
        dateIso: String,
        accessToken: String?,
    ): List<JSONObject> {
        val encoded = URLEncoder.encode(dateIso, Charsets.UTF_8.name())
        val (statusCode, body) = get(
            path = "/api/spec/plan/day-by-date?date=$encoded",
            accessToken = accessToken,
        )
        if (statusCode == 404) {
            return emptyList()
        }
        if (statusCode !in 200..299) {
            throw IllegalStateException("HTTP $statusCode: $body")
        }
        val json = JSONObject(body)
        return json.optJSONArray("items").toJsonObjectList()
    }

    fun fetchPlannerWorkspace(
        dateIso: String,
        accessToken: String?,
    ): JSONObject {
        val encoded = URLEncoder.encode(dateIso, Charsets.UTF_8.name())
        val (statusCode, body) = get(
            path = "/api/spec/plan/workspace?active_date=$encoded",
            accessToken = accessToken,
        )
        if (statusCode !in 200..299) {
            throw IllegalStateException("HTTP $statusCode: $body")
        }
        return JSONObject(body)
    }

    fun fetchGoogleConnectionState(accessToken: String?): GoogleCalendarConnectionState {
        val (statusCode, body) = get(
            path = "/api/spec/google/mobile/status",
            accessToken = accessToken,
        )
        if (statusCode !in 200..299) {
            throw IllegalStateException("HTTP $statusCode: $body")
        }
        val json = JSONObject(body)
        return GoogleCalendarConnectionState(
            connected = json.optBoolean("connected", false),
            status = json.optString("status", "").trim().ifBlank { null },
        )
    }

    fun fetchGoogleAuthUrl(
        accessToken: String,
        redirectUri: String,
        nextPath: String = "/calendar",
    ): String {
        val encodedNext = URLEncoder.encode(nextPath, Charsets.UTF_8.name())
        val encodedRedirect = URLEncoder.encode(redirectUri, Charsets.UTF_8.name())
        val (statusCode, body) = get(
            path = "/api/spec/google/mobile/auth?next=$encodedNext&redirect_uri=$encodedRedirect",
            accessToken = accessToken,
        )
        if (statusCode !in 200..299) {
            throw IllegalStateException("HTTP $statusCode: $body")
        }
        val json = JSONObject(body)
        return json.optString("authUrl", "").trim().ifBlank {
            throw IllegalStateException("missing_auth_url")
        }
    }

    private fun get(
        path: String,
        accessToken: String?,
    ): Pair<Int, String> {
        val conn = (URL("$normalizedBaseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 7000
            readTimeout = 7000
            setRequestProperty("Accept", "application/json")
            if (!accessToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $accessToken")
                // Keep compatibility with cookie-auth backends.
                setRequestProperty("Cookie", "access_token=$accessToken")
            }
        }

        return try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            code to text
        } finally {
            conn.disconnect()
        }
    }

    private fun JSONArray?.toJsonObjectList(): List<JSONObject> {
        val array = this ?: return emptyList()
        val out = mutableListOf<JSONObject>()
        for (index in 0 until array.length()) {
            val obj = array.optJSONObject(index) ?: continue
            out += obj
        }
        return out
    }
}
