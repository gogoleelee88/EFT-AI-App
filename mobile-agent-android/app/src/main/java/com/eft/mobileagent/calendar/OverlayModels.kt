package com.eft.mobileagent.calendar

data class OverlayItem(
    val id: String,
    val source: String,
    val title: String,
    val startMillis: Long,
    val endMillis: Long? = null,
    val sourceType: String = source,
    val missionType: String? = null,
    val taskUid: String? = null,
    val targetLatitude: Double? = null,
    val targetLongitude: Double? = null,
    val radiusMeters: Double? = null,
    val description: String? = null,
)
