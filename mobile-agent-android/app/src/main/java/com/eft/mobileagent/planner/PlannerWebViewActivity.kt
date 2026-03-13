package com.eft.mobileagent.planner

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.eft.mobileagent.R
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.progressindicator.LinearProgressIndicator
import java.util.Locale

class PlannerWebViewActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progress: LinearProgressIndicator
    private lateinit var errorView: TextView
    private var launchUri: Uri? = null
    private var pageLoadFailed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_recovery_webview)

        val toolbar = findViewById<MaterialToolbar>(R.id.recoveryToolbar)
        toolbar.title = intent.getStringExtra(EXTRA_TITLE) ?: "Plan"
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        toolbar.setNavigationOnClickListener { finish() }

        progress = findViewById(R.id.recoveryProgress)
        errorView = findViewById(R.id.recoveryError)
        webView = findViewById(R.id.recoveryWebView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        configureWebView()

        val normalizedUrl = normalizeLaunchUrl(intent.getStringExtra(EXTRA_URL))
        if (normalizedUrl == null) {
            showError("Planner page is unavailable.")
            return
        }

        launchUri = Uri.parse(normalizedUrl)
        webView.loadUrl(normalizedUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadsImagesAutomatically = true
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.isVisible = newProgress in 1..99
                progress.progress = newProgress
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                pageLoadFailed = false
                progress.isVisible = true
                errorView.isVisible = false
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                val uri = request.url ?: return false
                if (shouldHandleInternally(uri)) {
                    return false
                }
                openExternal(uri)
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                if (pageLoadFailed) return
                progress.isVisible = false
                errorView.isVisible = false
                webView.isVisible = true
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest,
                error: WebResourceError?,
            ) {
                if (!request.isForMainFrame) return
                pageLoadFailed = true
                val description = error?.description?.toString()?.trim().orEmpty()
                if (description.isNotEmpty()) {
                    showError(description)
                } else {
                    showError("Failed to load planner page.")
                }
            }
        }
    }

    private fun shouldHandleInternally(uri: Uri): Boolean {
        val launch = launchUri ?: return false
        val scheme = uri.scheme?.lowercase(Locale.US).orEmpty()
        if (scheme !in ALLOWED_SCHEMES) return false
        val launchHost = launch.host?.lowercase(Locale.US).orEmpty()
        val nextHost = uri.host?.lowercase(Locale.US).orEmpty()
        return launchHost.isNotBlank() && launchHost == nextHost
    }

    private fun openExternal(uri: Uri) {
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        }.onFailure {
            showError("Open the planner page in a browser.")
        }
    }

    private fun showError(message: String) {
        progress.isVisible = false
        webView.isVisible = false
        errorView.isVisible = true
        errorView.text = message
    }

    private fun normalizeLaunchUrl(rawUrl: String?): String? {
        val parsed = rawUrl
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.let { runCatching { Uri.parse(it) }.getOrNull() }
            ?: return null
        val scheme = parsed.scheme?.lowercase(Locale.US).orEmpty()
        if (scheme !in ALLOWED_SCHEMES) return null

        val builder = parsed.buildUpon().clearQuery()
        for (name in parsed.queryParameterNames) {
            parsed.getQueryParameters(name).forEach { value ->
                builder.appendQueryParameter(name, value)
            }
        }
        if (parsed.getQueryParameter("shell").isNullOrBlank()) {
            builder.appendQueryParameter("shell", "android")
        }
        if (parsed.getQueryParameter("native_bridge").isNullOrBlank()) {
            builder.appendQueryParameter("native_bridge", "android")
        }
        return builder.build().toString()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_URL = "planner_url"
        private const val EXTRA_TITLE = "planner_title"
        private val ALLOWED_SCHEMES = setOf("http", "https")

        fun open(context: Context, plannerUrl: String, title: String = "Plan") {
            val intent = Intent(context, PlannerWebViewActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_URL, plannerUrl)
                .putExtra(EXTRA_TITLE, title)
            context.startActivity(intent)
        }
    }
}
