package com.eft.mobileagent.google

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.eft.mobileagent.MainActivity

class GoogleOAuthCallbackActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val callbackUri = intent?.data?.toString().orEmpty()
        val forward = Intent(this, MainActivity::class.java).apply {
            action = ACTION_OAUTH_CALLBACK
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(EXTRA_CALLBACK_URI, callbackUri)
        }
        startActivity(forward)
        finish()
    }

    companion object {
        const val ACTION_OAUTH_CALLBACK = "com.eft.mobileagent.google.OAUTH_CALLBACK"
        const val EXTRA_CALLBACK_URI = "oauth_callback_uri"
    }
}

