from math import asin, cos, radians, sin, sqrt
from typing import Optional

from backend.spec_loop.models import Place


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two latitude/longitude points (meters)."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))

    earth_radius_m = 6371000
    return earth_radius_m * c


def verify_location_mission(
    current_lat: float,
    current_lng: float,
    target_place: Place,
    wifi_ssid: Optional[str] = None,
    bluetooth_beacon_id: Optional[str] = None,
) -> dict:
    """Verify whether current position satisfies any configured location conditions."""
    results = {
        "passed": False,
        "confidence": 0.0,
        "gps_matched": False,
        "gps_distance_m": None,
        "wifi_matched": False,
        "bluetooth_matched": False,
        "reason": "",
    }

    verification_methods = target_place.verification_method or []
    checks_passed: list[str] = []
    checks_total = len(verification_methods)

    if "gps" in verification_methods:
        if target_place.gps_lat and target_place.gps_lng:
            distance_m = calculate_distance(
                current_lat, current_lng, target_place.gps_lat, target_place.gps_lng
            )
            results["gps_distance_m"] = round(distance_m, 1)
            results["gps_matched"] = distance_m <= (target_place.gps_radius or 0)

            if results["gps_matched"]:
                checks_passed.append(f"GPS: {distance_m:.1f}m (OK)")
            else:
                checks_passed.append(f"GPS: {distance_m:.1f}m (Mismatch)")

    if "wifi" in verification_methods:
        if target_place.wifi_ssid and wifi_ssid:
            results["wifi_matched"] = target_place.wifi_ssid == wifi_ssid
            if results["wifi_matched"]:
                checks_passed.append(f"Wi-Fi: {wifi_ssid} (OK)")
            else:
                checks_passed.append(f"Wi-Fi: mismatch ({wifi_ssid})")

    if "bluetooth" in verification_methods:
        if target_place.bluetooth_beacon_id and bluetooth_beacon_id:
            results["bluetooth_matched"] = (
                target_place.bluetooth_beacon_id == bluetooth_beacon_id
            )
            if results["bluetooth_matched"]:
                checks_passed.append("Bluetooth: matched")
            else:
                checks_passed.append("Bluetooth: mismatch")

    matched_count = (
        int(results["gps_matched"])
        + int(results["wifi_matched"])
        + int(results["bluetooth_matched"])
    )

    if checks_total > 0:
        results["passed"] = matched_count >= 1
        results["confidence"] = matched_count / checks_total
        results["reason"] = " | ".join(checks_passed) if checks_passed else "No validation passed."
    else:
        results["passed"] = False
        results["reason"] = "No verification methods configured for this mission."

    return results
