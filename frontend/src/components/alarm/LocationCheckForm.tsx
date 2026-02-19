// 위치 확인 폼 컴포넌트
import React, { useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type { MissionConfig, LocationMissionConfig } from "../../types/mission";
import { getCurrentPosition } from "../../services/missionService";

interface LocationCheckFormProps {
  dayId: number;
  mission: MissionConfig;
  onSuccess: (key: string) => void;
  onFail: (key: string) => void;
  onCancel: () => void;
  userId?: string;
  missionRunId?: string;
}

const LocationCheckForm: React.FC<LocationCheckFormProps> = ({
  dayId,
  mission,
  onSuccess,
  onFail,
  onCancel,
  userId,
  missionRunId,
}) => {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any>(null);

  const config = mission.config as LocationMissionConfig;

  const handleCheckLocation = async () => {
    setChecking(true);
    try {
      // 현재 위치 가져오기
      const position = await getCurrentPosition();

      // 위치 검증 API 호출
      const params = new URLSearchParams({
        day_id: dayId.toString(),
        place_id: config.place_id.toString(),
        current_lat: position.lat.toString(),
        current_lng: position.lng.toString(),
      });

      if (userId) params.append("user_id", userId);
      if (missionRunId) params.append("mission_run_id", missionRunId);

      // TODO: Wi-Fi, Bluetooth 추가
      // if (wifiSsid) params.append("wifi_ssid", wifiSsid);

      const response = await fetch(`/api/spec/missions/verify/location?${params}`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();
      setResult(data);

      if (data.passed) {
        setTimeout(() => {
          onSuccess(`location_0`);
        }, 1500);
      } else {
        onFail(`location_0`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "위치 확인 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="max-w-md w-full">
        <Card>
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">📍 장소 인증</h3>

            {/* 목표 장소 표시 */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="text-sm font-medium text-blue-900">목표 장소:</div>
              <div className="text-base text-blue-800 mt-1 font-semibold">
                {config.place_name}
              </div>
              {config.address && (
                <div className="text-xs text-blue-700 mt-1">{config.address}</div>
              )}
              {config.gps && (
                <div className="text-xs text-blue-700 mt-1">
                  반경: ±{config.gps.radius}m
                </div>
              )}
            </div>

            {/* 검증 방법 */}
            <div className="text-xs text-gray-600">
              검증 방법:{" "}
              {config.verification_method
                .map((m) =>
                  m === "gps" ? "GPS" : m === "wifi" ? "Wi-Fi" : "Bluetooth"
                )
                .join(" + ")}
            </div>

            {/* 검증 결과 */}
            {result && (
              <div
                className={`rounded-md p-3 ${
                  result.passed
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    result.passed ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.passed ? "✅ 위치 확인 완료" : "❌ 위치 불일치"}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    result.passed ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {result.reason}
                </div>
                {result.gps_distance_m !== undefined && (
                  <div className="text-xs text-gray-600 mt-1">
                    거리: {result.gps_distance_m}m
                  </div>
                )}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="md" onClick={onCancel} fullWidth>
                취소
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCheckLocation}
                disabled={checking}
                fullWidth
              >
                {checking ? "확인 중..." : "위치 확인"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LocationCheckForm;
