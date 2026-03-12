package com.eft.mobileagent.recovery

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import com.eft.mobileagent.focus.FocusRecoveryCoordinator

class RecoveryInterventionHostActivity : AppCompatActivity(), EftStrictIntakeChatBottomSheet.Listener {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cancelLaunchNotification()
        if (savedInstanceState == null) {
            showPromptDialog()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent != null) {
            setIntent(intent)
        }
        cancelLaunchNotification()
    }

    override fun onStrictIntakeSubmit(payload: EftStrictIntakeBottomSheet.StrictIntakePayload) {
        Thread {
            val ok = FocusRecoveryCoordinator.submitStrictIntake(this, payload)
            runOnUiThread {
                if (!ok) {
                    Toast.makeText(this, "Strict intake save failed", Toast.LENGTH_SHORT).show()
                }
                FocusRecoveryCoordinator.markMeaningfulProgress(this, "strict_intake")
                RecoveryPlanActivity.open(this, payload)
                finish()
            }
        }.start()
    }

    override fun onStrictIntakeCancelled() {
        finish()
    }

    private fun showPromptDialog() {
        val sentence = intent.getStringExtra(EXTRA_ENTRY_SENTENCE)
            ?.trim()
            ?.ifBlank { null }
            ?: "You seem blocked right now.\nAnswer one recovery prompt and return to the strict flow."

        AlertDialog.Builder(this)
            .setTitle("Focus recovery")
            .setMessage(sentence)
            .setPositiveButton("Start recovery") { _, _ ->
                showStrictSheet()
            }
            .setNegativeButton("Not now") { _, _ ->
                finish()
            }
            .setOnCancelListener { finish() }
            .show()
    }

    private fun showStrictSheet() {
        val fm = supportFragmentManager
        if (fm.isStateSaved) {
            finish()
            return
        }
        if (fm.findFragmentByTag(STRICT_CHAT_SHEET_TAG) != null) return
        EftStrictIntakeChatBottomSheet.newInstance(
            sessionId = intent.getStringExtra(EXTRA_SESSION_ID)
                ?: "android_recovery_${System.currentTimeMillis()}",
            userId = intent.getStringExtra(EXTRA_USER_ID),
            entryPoint = intent.getStringExtra(EXTRA_ENTRY_POINT),
            scheduleName = intent.getStringExtra(EXTRA_SCHEDULE_NAME),
            focusSessionId = intent.getStringExtra(EXTRA_FOCUS_SESSION_ID),
            distractionType = intent.getStringExtra(EXTRA_DISTRACTION_TYPE),
            blockedMin = intent.getIntExtra(EXTRA_BLOCKED_MIN, -1).takeIf { it >= 0 },
            entrySentence = intent.getStringExtra(EXTRA_ENTRY_SENTENCE),
        ).show(fm, STRICT_CHAT_SHEET_TAG)
    }

    private fun cancelLaunchNotification() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.cancel(LAUNCH_NOTIFICATION_ID)
    }

    companion object {
        private const val STRICT_CHAT_SHEET_TAG = "EftStrictIntakeChatBottomSheet"
        private const val EXTRA_SESSION_ID = "session_id"
        private const val EXTRA_USER_ID = "user_id"
        private const val EXTRA_ENTRY_POINT = "entry_point"
        private const val EXTRA_SCHEDULE_NAME = "schedule_name"
        private const val EXTRA_FOCUS_SESSION_ID = "focus_session_id"
        private const val EXTRA_DISTRACTION_TYPE = "distraction_type"
        private const val EXTRA_BLOCKED_MIN = "blocked_min"
        private const val EXTRA_ENTRY_SENTENCE = "entry_sentence"
        private const val EXTRA_RECOVERY_URL = "recovery_url"
        private const val LAUNCH_NOTIFICATION_CHANNEL_ID = "focus_recovery_intervention"
        private const val LAUNCH_NOTIFICATION_ID = 44022

        private fun buildIntent(
            context: Context,
            sessionId: String,
            userId: String?,
            entryPoint: String?,
            scheduleName: String?,
            focusSessionId: String?,
            distractionType: String?,
            blockedMin: Int?,
            entrySentence: String?,
            recoveryUrl: String?,
        ): Intent {
            return Intent(context, RecoveryInterventionHostActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(EXTRA_SESSION_ID, sessionId)
                .putExtra(EXTRA_USER_ID, userId)
                .putExtra(EXTRA_ENTRY_POINT, entryPoint)
                .putExtra(EXTRA_SCHEDULE_NAME, scheduleName)
                .putExtra(EXTRA_FOCUS_SESSION_ID, focusSessionId)
                .putExtra(EXTRA_DISTRACTION_TYPE, distractionType)
                .putExtra(EXTRA_ENTRY_SENTENCE, entrySentence)
                .putExtra(EXTRA_RECOVERY_URL, recoveryUrl)
                .apply {
                    if (blockedMin != null) {
                        putExtra(EXTRA_BLOCKED_MIN, blockedMin)
                    }
                }
        }

        fun open(
            context: Context,
            sessionId: String,
            userId: String?,
            entryPoint: String?,
            scheduleName: String?,
            focusSessionId: String?,
            distractionType: String?,
            blockedMin: Int?,
            entrySentence: String?,
            recoveryUrl: String?,
        ) {
            val intent = buildIntent(
                context = context,
                sessionId = sessionId,
                userId = userId,
                entryPoint = entryPoint,
                scheduleName = scheduleName,
                focusSessionId = focusSessionId,
                distractionType = distractionType,
                blockedMin = blockedMin,
                entrySentence = entrySentence,
                recoveryUrl = recoveryUrl,
            )
            context.startActivity(intent)
        }

        fun openFromBackground(
            context: Context,
            sessionId: String,
            userId: String?,
            entryPoint: String?,
            scheduleName: String?,
            focusSessionId: String?,
            distractionType: String?,
            blockedMin: Int?,
            entrySentence: String?,
            recoveryUrl: String?,
        ) {
            val appContext = context.applicationContext
            val intent = buildIntent(
                context = appContext,
                sessionId = sessionId,
                userId = userId,
                entryPoint = entryPoint,
                scheduleName = scheduleName,
                focusSessionId = focusSessionId,
                distractionType = distractionType,
                blockedMin = blockedMin,
                entrySentence = entrySentence,
                recoveryUrl = recoveryUrl,
            )
            showLaunchNotification(
                context = appContext,
                sessionId = sessionId,
                intent = intent,
                entrySentence = entrySentence,
            )
            runCatching {
                appContext.startActivity(intent)
            }
        }

        private fun showLaunchNotification(
            context: Context,
            sessionId: String,
            intent: Intent,
            entrySentence: String?,
        ) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val existing = manager.getNotificationChannel(LAUNCH_NOTIFICATION_CHANNEL_ID)
                if (existing == null) {
                    manager.createNotificationChannel(
                        NotificationChannel(
                            LAUNCH_NOTIFICATION_CHANNEL_ID,
                            "Focus recovery intervention",
                            NotificationManager.IMPORTANCE_HIGH,
                        ).apply {
                            description = "Urgent focus recovery prompts"
                            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                        },
                    )
                }
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                sessionId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val contentText = entrySentence?.trim()?.ifBlank { null }
                ?: "Return to your focus session and complete the recovery check-in."
            val notification = NotificationCompat.Builder(context, LAUNCH_NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("Focus recovery")
                .setContentText(contentText)
                .setStyle(NotificationCompat.BigTextStyle().bigText(contentText))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)
                .build()
            manager.notify(LAUNCH_NOTIFICATION_ID, notification)
        }
    }
}
