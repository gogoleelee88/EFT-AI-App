package com.eft.mobileagent.behavior

import android.content.Context

object BehaviorAgentController {
    fun start(context: Context) = BehaviorAgentService.start(context)

    fun stop(context: Context) = BehaviorAgentService.stop(context)

    fun flush(context: Context) = BehaviorAgentService.flush(context)
}

