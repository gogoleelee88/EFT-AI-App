package com.eft.mobileagent.behavior.usage

data class AppUsageStat(
    val category: String,
    var seconds: Int = 0,
    var count: Int = 0,
)
