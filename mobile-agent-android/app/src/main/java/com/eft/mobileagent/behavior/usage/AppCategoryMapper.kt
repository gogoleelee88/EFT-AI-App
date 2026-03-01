package com.eft.mobileagent.behavior.usage

object AppCategoryMapper {
    // Work-ish browsers that are likely used for development/docs.
    private val workBrowserHostsOrApps = listOf(
        "com.android.chrome",
        "com.sec.android.app.sbrowser",
        "org.mozilla.firefox",
        "com.microsoft.emmx", // Edge
    )

    // Apps we never want to count as distraction (system/permissions/phone/etc.).
    private val allowlistPackages = listOf(
        "com.android.systemui",
        "com.google.android.permissioncontroller",
        "com.android.permissioncontroller",
        "com.android.settings",
        "com.google.android.dialer",
        "com.samsung.android.dialer",
        "com.android.incallui",
        "com.google.android.apps.nbu.paisa.user",
    )

    fun isAllowlisted(packageName: String?): Boolean {
        val p = (packageName ?: "").trim()
        if (p.isBlank()) return false
        return allowlistPackages.any { p == it }
    }

    fun map(packageName: String?): String {
        val p = (packageName ?: "").lowercase().trim()
        if (p.isBlank()) return "Unknown"

        // Allowlisted system transitions: count separately.
        if (isAllowlisted(p)) return "System"

        return when {
            p.contains("youtube") -> "YouTube"
            p.contains("instagram") || p.contains("tiktok") || p.contains("facebook") || p.contains("twitter") -> "SNS"

            // Browser is neutral by default (not always distraction).
            workBrowserHostsOrApps.any { p.contains(it) } ||
                p.contains("chrome") || p.contains("samsung.internet") || p.contains("firefox") || p.contains("emmx") -> "Browser"

            p.contains("notion") || p.contains("slack") || p.contains("github") || p.contains("code") || p.contains("figma") -> "WorkTool"
            else -> "Other"
        }
    }

    /**
     * Browser can be treated as WorkTool if it dominates and SNS/YouTube are low.
     */
    fun shouldTreatBrowserAsWork(summary: List<AppUsageStat>): Boolean {
        val total = summary.sumOf { it.seconds }.coerceAtLeast(1)
        val browserSec = summary.firstOrNull { it.category == "Browser" }?.seconds ?: 0
        val snsSec = summary.firstOrNull { it.category == "SNS" }?.seconds ?: 0
        val ytSec = summary.firstOrNull { it.category == "YouTube" }?.seconds ?: 0

        val browserRatio = browserSec.toDouble() / total.toDouble()
        val badRatio = (snsSec + ytSec).toDouble() / total.toDouble()

        return browserRatio >= 0.55 && badRatio <= 0.10
    }
}
