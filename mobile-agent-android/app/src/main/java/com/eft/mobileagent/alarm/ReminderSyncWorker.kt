package com.eft.mobileagent.alarm

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

class ReminderSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : Worker(appContext, params) {
    override fun doWork(): Result {
        val outcome = runCatching {
            ReminderSyncManager.syncWithSavedConfig(
                context = applicationContext,
                limit = 80,
            )
        }

        outcome.onSuccess { summary ->
            Log.i(
                TAG,
                "sync ok fetched=${summary.fetchedCount} scheduled=${summary.scheduledCount} skipped=${summary.skippedCount}",
            )
        }.onFailure { err ->
            if (err is MissingSyncConfigException) {
                Log.i(TAG, "sync skipped: missing config")
            } else {
                Log.w(TAG, "sync failed: ${err.message}", err)
            }
        }

        val err = outcome.exceptionOrNull()
        if (err == null || err is MissingSyncConfigException) {
            return Result.success()
        }
        if (runAttemptCount >= MAX_RETRY_ATTEMPTS) {
            return Result.failure()
        }
        return Result.retry()
    }

    companion object {
        private const val TAG = "ReminderSyncWorker"
        private const val MAX_RETRY_ATTEMPTS = 3
    }
}
