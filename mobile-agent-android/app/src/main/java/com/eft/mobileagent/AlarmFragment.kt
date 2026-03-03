package com.eft.mobileagent

import android.os.Bundle
import android.view.View
import androidx.fragment.app.Fragment

class AlarmFragment : Fragment(R.layout.fragment_alarm) {

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<View>(R.id.scheduleAlarmButton)?.setOnClickListener {
            // TODO move Legacy scheduleAlarm logic
        }

        view.findViewById<View>(R.id.cancelAlarmButton)?.setOnClickListener {
            // TODO move Legacy cancelLastAlarm logic
        }
    }
}
