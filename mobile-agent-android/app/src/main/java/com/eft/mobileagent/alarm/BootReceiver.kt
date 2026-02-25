package com.eft.mobileagent.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            AlarmScheduler(context).rescheduleAll()
            if (ReminderSyncManager.hasConfig(context)) {
                ReminderSyncWorkScheduler.ensurePeriodicSync(context)
                ReminderSyncWorkScheduler.triggerImmediateSync(context)
            }
        }
    }
}
