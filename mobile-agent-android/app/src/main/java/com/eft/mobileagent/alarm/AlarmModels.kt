package com.eft.mobileagent.alarm

data class TargetLocation(
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Float = DEFAULT_RADIUS_METERS,
) {
    companion object {
        const val DEFAULT_RADIUS_METERS: Float = 80f
    }
}

data class AlarmJob(
    val alarmId: String,
    val triggerAtMillis: Long,
    val label: String,
    val startTimeLocal: String? = null,
    val endTimeLocal: String? = null,
    val endsNextDay: Boolean = false,
    val targetLatitude: Double? = null,
    val targetLongitude: Double? = null,
    val radiusMeters: Float = TargetLocation.DEFAULT_RADIUS_METERS,
    val planDate: String = "",
    val taskUid: String = "",
    val missionType: String = AlarmMissionType.LOCATION_ARRIVAL.value,
    val sourceType: String = AlarmSourceType.SERVICE.value,
    val enabled: Boolean = true,
)

data class LocationValidationResult(
    val withinRadius: Boolean,
    val distanceMeters: Float,
    val currentLatitude: Double? = null,
    val currentLongitude: Double? = null,
    val message: String? = null,
)

enum class AlarmMissionType(val value: String) {
    LOCATION_ARRIVAL("location_arrival"),
    MANUAL_DISMISS("manual_dismiss"),
    TIME_CHECK("time_check"),
    PHOTO("photo"),
}

enum class AlarmSourceType(val value: String) {
    SERVICE("service"),
    GOOGLE("google"),
}
