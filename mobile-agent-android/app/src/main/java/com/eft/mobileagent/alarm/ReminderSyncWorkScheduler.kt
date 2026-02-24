package com.eft.mobileagent.alarm

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object ReminderSyncWorkScheduler {
    private const val PERIODIC_WORK_NAME = "reminder-sync-periodic"
    private const val IMMEDIATE_WORK_NAME = "reminder-sync-immediate"
    private const val PERIODIC_MINUTES = 15L

    fun ensurePeriodicSync(context: Context) {
        val request = PeriodicWorkRequestBuilder<ReminderSyncWorker>(
            PERIODIC_MINUTES,
            TimeUnit.MINUTES,
        )
            .setConstraints(networkConstraint())
            .addTag(PERIODIC_WORK_NAME)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun triggerImmediateSync(context: Context) {
        val request = OneTimeWorkRequestBuilder<ReminderSyncWorker>()
            .setConstraints(networkConstraint())
            .addTag(IMMEDIATE_WORK_NAME)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            androidx.work.ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    private fun networkConstraint(): Constraints {
        return Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    }
}
