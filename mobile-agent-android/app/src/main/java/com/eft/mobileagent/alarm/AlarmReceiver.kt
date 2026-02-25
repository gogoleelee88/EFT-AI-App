package com.eft.mobileagent.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_FIRE_ALARM) return
        val alarmId = intent.getStringExtra(EXTRA_ALARM_ID) ?: return

        val repository = AlarmRepository(context)
        val alarm = repository.getAlarm(alarmId) ?: return
        if (!alarm.enabled) return

        val serviceIntent = Intent(context, AlarmSoundService::class.java).apply {
            action = AlarmSoundService.ACTION_START
            putExtra(EXTRA_ALARM_ID, alarmId)
            putExtra(EXTRA_ALARM_LABEL, alarm.label)
        }
        runCatching {
            ContextCompat.startForegroundService(context, serviceIntent)
        }

        val alarmActivityIntent = Intent(context, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_ALARM_ID, alarmId)
        }
        runCatching {
            context.startActivity(alarmActivityIntent)
        }
    }

    companion object {
        const val ACTION_FIRE_ALARM = "com.eft.mobileagent.action.FIRE_ALARM"
        const val EXTRA_ALARM_ID = "alarm_id"
        const val EXTRA_ALARM_LABEL = "alarm_label"
    }
}
