package com.eft.mobileagent

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.eft.mobileagent.google.GoogleOAuthCallbackActivity
import com.google.android.material.bottomnavigation.BottomNavigationView

class MainActivity : AppCompatActivity() {
    private lateinit var bottomNavView: BottomNavigationView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val navHost = supportFragmentManager.findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        val navController = navHost.navController

        bottomNavView = findViewById<BottomNavigationView>(R.id.bottomNavView)
        bottomNavView.setupWithNavController(navController)

        handleIntent(intent)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: android.content.Intent?) {
        val incoming = intent ?: return
        if (incoming.action != GoogleOAuthCallbackActivity.ACTION_OAUTH_CALLBACK) {
            return
        }

        bottomNavView.selectedItemId = R.id.nav_calendar
        val ok = incoming.getBooleanExtra(GoogleOAuthCallbackActivity.EXTRA_OAUTH_OK, false)
        val error = incoming.getStringExtra(GoogleOAuthCallbackActivity.EXTRA_OAUTH_ERROR)
        Toast.makeText(
            this,
            if (ok) "Google Calendar connected." else "Google Calendar connect failed: ${error ?: "unknown"}",
            Toast.LENGTH_SHORT,
        ).show()
    }
}
