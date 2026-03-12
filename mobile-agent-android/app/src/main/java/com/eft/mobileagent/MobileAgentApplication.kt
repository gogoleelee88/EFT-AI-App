package com.eft.mobileagent

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.eft.mobileagent.focus.FocusRecoveryCoordinator

class MobileAgentApplication : Application(), DefaultLifecycleObserver {
    override fun onCreate() {
        super<Application>.onCreate()
        ProcessLifecycleOwner.get().lifecycle.addObserver(this)
        FocusRecoveryCoordinator.restoreIfNeeded(this)
    }

    override fun onStop(owner: LifecycleOwner) {
        FocusRecoveryCoordinator.onAppBackgrounded(this)
    }
}
