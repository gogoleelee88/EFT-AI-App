package com.eft.mobileagent.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.concurrent.atomic.AtomicInteger

class AlarmScheduler(private val context: Context) {
    private val alarmManager = context.getSystemService(AlarmManager::class.java)
    private val repository = AlarmRepository(context)

    companion object {
        private const val TAG = "AlarmScheduler"
        private val scheduleCounter = AtomicInteger(0)
    }

    fun schedule(job: AlarmJob) {
        val scheduleCallCount = scheduleCounter.incrementAndGet()
        Log.i(
            TAG,
            "AlarmScheduler scheduled count=$scheduleCallCount (sync_key=${job.alarmId})",
        )
        repository.upsertAlarm(job)
        val pendingIntent = buildAlarmPendingIntent(job.alarmId)
        val triggerAtMillis = job.triggerAtMillis

        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
        if (canExact) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
        }
    }

    fun cancel(alarmId: String) {
        val pendingIntent = buildAlarmPendingIntent(alarmId)
        alarmManager.cancel(pendingIntent)
        repository.disableAlarm(alarmId)
    }

    fun rescheduleAll() {
        repository.getAllActiveAlarms().forEach { schedule(it) }
    }

    private fun buildAlarmPendingIntent(alarmId: String): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_FIRE_ALARM
            putExtra(AlarmReceiver.EXTRA_ALARM_ID, alarmId)
        }
        return PendingIntent.getBroadcast(
            context,
            alarmId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
