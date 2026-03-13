package com.eft.mobileagent.planner

import android.content.Context
import android.net.Uri
import com.eft.mobileagent.BuildConfig
import com.eft.mobileagent.alarm.ReminderSyncManager
import java.util.Locale

enum class PlannerTab(
    val queryValue: String,
    val title: String,
) {
    DEADLINE("deadline", "Deadlines"),
    TODAY("today", "Today"),
    ALARM("alarm", "Alarms"),
    ;

    companion object {
        fun fromQueryValue(raw: String?): PlannerTab {
            return entries.firstOrNull { it.queryValue == raw?.trim()?.lowercase(Locale.US) } ?: TODAY
        }
    }
}

object PlannerLauncher {
    private const val PREFS_NAME = "planner_launcher"
    private const val KEY_LAST_TAB = "last_tab"

    fun resolvePlannerBaseUrl(context: Context): String? {
        val primary = ReminderSyncManager.normalizeBaseUrl(BuildConfig.RECOVERY_WEB_BASE_URL)
        if (primary != null) {
            return primary
        }
        return ReminderSyncManager.loadConfig(context)?.baseUrl
    }

    fun getLastOpenedTab(context: Context): PlannerTab {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return PlannerTab.fromQueryValue(prefs.getString(KEY_LAST_TAB, null))
    }

    fun rememberLastOpenedTab(
        context: Context,
        tab: PlannerTab,
    ) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LAST_TAB, tab.queryValue)
            .apply()
    }

    fun buildPlannerUrl(
        context: Context,
        tab: PlannerTab,
        activeDate: String? = null,
        taskUid: String? = null,
        source: String = "android",
    ): String? {
        val baseUrl = resolvePlannerBaseUrl(context) ?: return null
        val baseUri = Uri.parse(baseUrl)
        val builder = baseUri.buildUpon()
            .path("/planner")
            .appendQueryParameter("tab", tab.queryValue)
            .appendQueryParameter("shell", "android")
            .appendQueryParameter("native_bridge", "android")
            .appendQueryParameter("source", source)

        if (!activeDate.isNullOrBlank()) {
            builder.appendQueryParameter("active_date", activeDate)
        }
        if (!taskUid.isNullOrBlank()) {
            builder.appendQueryParameter("task_uid", taskUid)
        }

        return builder.build().toString()
    }

    fun open(
        context: Context,
        tab: PlannerTab = getLastOpenedTab(context),
        activeDate: String? = null,
        taskUid: String? = null,
        source: String = "android",
    ): Boolean {
        val url = buildPlannerUrl(
            context = context,
            tab = tab,
            activeDate = activeDate,
            taskUid = taskUid,
            source = source,
        ) ?: return false

        rememberLastOpenedTab(context, tab)
        PlannerWebViewActivity.open(
            context = context,
            plannerUrl = url,
            title = "Plan",
        )
        return true
    }
}
