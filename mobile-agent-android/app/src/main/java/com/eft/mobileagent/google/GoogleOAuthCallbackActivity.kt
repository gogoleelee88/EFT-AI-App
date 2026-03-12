package com.eft.mobileagent.google

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.eft.mobileagent.MainActivity
import com.eft.mobileagent.behavior.BehaviorAgentConfigStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class GoogleOAuthCallbackActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val callbackUri = intent?.data?.toString().orEmpty()
        if (callbackUri.isBlank()) {
            forwardToMain(callbackUri = callbackUri, ok = false, error = "missing_callback_uri")
            return
        }

        Thread {
            val result = runCatching { exchangeCallback(callbackUri) }
            runOnUiThread {
                result.onSuccess {
                    forwardToMain(callbackUri = callbackUri, ok = true, next = it)
                }.onFailure { err ->
                    forwardToMain(
                        callbackUri = callbackUri,
                        ok = false,
                        error = err.message ?: "oauth_exchange_failed",
                    )
                }
            }
        }.start()
    }

    private fun exchangeCallback(callbackUri: String): String? {
        val data = intent?.data ?: error("missing_callback_data")
        val code = data.getQueryParameter("code")?.trim().orEmpty()
        val state = data.getQueryParameter("state")?.trim().orEmpty()
        if (code.isBlank() || state.isBlank()) {
            error("missing_code_or_state")
        }

        val config = BehaviorAgentConfigStore(this).load()
        val encodedCode = URLEncoder.encode(code, Charsets.UTF_8.name())
        val encodedState = URLEncoder.encode(state, Charsets.UTF_8.name())
        val encodedRedirect = URLEncoder.encode(GOOGLE_CALLBACK_URI, Charsets.UTF_8.name())
        val endpoint =
            "${config.backendBaseUrl}/api/spec/google/mobile/callback" +
                "?code=$encodedCode&state=$encodedState&redirect_uri=$encodedRedirect"

        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 7_000
            readTimeout = 7_000
            setRequestProperty("Accept", "application/json")
        }

        return try {
            val statusCode = conn.responseCode
            val stream = if (statusCode in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val body = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            if (statusCode !in 200..299) {
                error("HTTP $statusCode: $body")
            }
            JSONObject(body).optString("next", "").trim().ifBlank { null }
        } finally {
            conn.disconnect()
        }
    }

    private fun forwardToMain(
        callbackUri: String,
        ok: Boolean,
        next: String? = null,
        error: String? = null,
    ) {
        val forward = Intent(this, MainActivity::class.java).apply {
            action = ACTION_OAUTH_CALLBACK
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(EXTRA_CALLBACK_URI, callbackUri)
            putExtra(EXTRA_OAUTH_OK, ok)
            putExtra(EXTRA_NEXT_PATH, next)
            putExtra(EXTRA_OAUTH_ERROR, error)
        }
        startActivity(forward)
        finish()
    }

    companion object {
        private const val GOOGLE_CALLBACK_URI = "myapp://oauth/google/callback"
        const val ACTION_OAUTH_CALLBACK = "com.eft.mobileagent.google.OAUTH_CALLBACK"
        const val EXTRA_CALLBACK_URI = "oauth_callback_uri"
        const val EXTRA_OAUTH_OK = "oauth_ok"
        const val EXTRA_OAUTH_ERROR = "oauth_error"
        const val EXTRA_NEXT_PATH = "oauth_next_path"
    }
}
