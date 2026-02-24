package com.eft.mobileagent.alarm

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

class LocationMissionValidator(context: Context) {
    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission")
    fun validateArrival(
        target: TargetLocation,
        onResult: (LocationValidationResult) -> Unit,
    ) {
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(5_000L)
            .build()
        val tokenSource = CancellationTokenSource()

        fusedClient.getCurrentLocation(request, tokenSource.token)
            .addOnSuccessListener { loc ->
                if (loc != null) {
                    onResult(compareDistance(loc, target))
                    return@addOnSuccessListener
                }
                fallbackLastLocation(target, onResult)
            }
            .addOnFailureListener {
                fallbackLastLocation(target, onResult)
            }
    }

    @SuppressLint("MissingPermission")
    private fun fallbackLastLocation(
        target: TargetLocation,
        onResult: (LocationValidationResult) -> Unit,
    ) {
        fusedClient.lastLocation
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    onResult(
                        LocationValidationResult(
                            withinRadius = false,
                            distanceMeters = Float.MAX_VALUE,
                            message = "현재 위치를 읽지 못했습니다. 다시 시도해주세요.",
                        )
                    )
                } else {
                    onResult(compareDistance(loc, target))
                }
            }
            .addOnFailureListener { err ->
                onResult(
                    LocationValidationResult(
                        withinRadius = false,
                        distanceMeters = Float.MAX_VALUE,
                        message = err.message ?: "위치 측정에 실패했습니다.",
                    )
                )
            }
    }

    private fun compareDistance(location: Location, target: TargetLocation): LocationValidationResult {
        val result = FloatArray(1)
        Location.distanceBetween(
            location.latitude,
            location.longitude,
            target.latitude,
            target.longitude,
            result,
        )
        val distanceMeters = result[0]
        val success = distanceMeters <= target.radiusMeters
        val message = if (success) {
            "도착 확인: ${distanceMeters.toInt()}m"
        } else {
            "반경 밖입니다: ${distanceMeters.toInt()}m (기준 ${target.radiusMeters.toInt()}m 이하)"
        }
        return LocationValidationResult(
            withinRadius = success,
            distanceMeters = distanceMeters,
            currentLatitude = location.latitude,
            currentLongitude = location.longitude,
            message = message,
        )
    }
}
