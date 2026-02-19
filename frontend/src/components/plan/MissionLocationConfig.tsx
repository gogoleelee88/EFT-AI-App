// 장소 인증 상세 설정 컴포넌트
import React, { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type { LocationMissionConfig, Place } from "../../types/mission";
import { getPlaces } from "../../services/missionService";
import PlaceRegistrationForm from "./PlaceRegistrationForm";

interface MissionLocationConfigProps {
  userId?: string;
  initialConfig?: LocationMissionConfig;
  onSave: (config: LocationMissionConfig | null) => void; // null = 장소 상관없음
  onCancel: () => void;
}

const MissionLocationConfig: React.FC<MissionLocationConfigProps> = ({
  userId,
  initialConfig,
  onSave,
  onCancel,
}) => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(
    initialConfig?.place_id || null
  );
  const [skipLocation, setSkipLocation] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlaces();
  }, []);

  const loadPlaces = async () => {
    setLoading(true);
    try {
      const data = await getPlaces(userId);
      setPlaces(data);
    } catch (err) {
      console.error("장소 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (skipLocation) {
      onSave(null); // 장소 상관없음
      return;
    }

    if (!selectedPlaceId) {
      alert("장소를 선택하거나 '장소 상관없음'을 선택하세요.");
      return;
    }

    const selectedPlace = places.find((p) => p.place_id === selectedPlaceId);
    if (!selectedPlace) {
      alert("선택한 장소를 찾을 수 없습니다.");
      return;
    }

    const config: LocationMissionConfig = {
      place_id: selectedPlace.place_id,
      place_name: selectedPlace.name,
      address: selectedPlace.address,
      gps: selectedPlace.gps_lat && selectedPlace.gps_lng
        ? {
            lat: selectedPlace.gps_lat,
            lng: selectedPlace.gps_lng,
            radius: selectedPlace.gps_radius,
          }
        : undefined,
      wifi_ssid: selectedPlace.wifi_ssid,
      bluetooth_beacon_id: selectedPlace.bluetooth_beacon_id,
      verification_method: (selectedPlace.verification_method || []) as (
        | "gps"
        | "wifi"
        | "bluetooth"
      )[],
    };

    onSave(config);
  };

  const handlePlaceRegistered = (newPlace: Place) => {
    setPlaces((prev) => [newPlace, ...prev]);
    setSelectedPlaceId(newPlace.place_id);
    setShowRegistration(false);
    setSkipLocation(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800">📍 장소 인증 설정</h3>

          {/* 자주 가는 장소 */}
          {places.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                🔄 자주 가는 장소
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {places.map((place) => (
                  <div
                    key={place.place_id}
                    onClick={() => {
                      setSelectedPlaceId(place.place_id);
                      setSkipLocation(false);
                    }}
                    className={`
                      border rounded-md p-3 cursor-pointer transition-all
                      ${
                        selectedPlaceId === place.place_id
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          ● {place.name}
                        </div>
                        {place.address && (
                          <div className="text-xs text-gray-600 mt-1">
                            주소: {place.address}
                          </div>
                        )}
                        {place.wifi_ssid && (
                          <div className="text-xs text-gray-600 mt-1">
                            Wi-Fi: {place.wifi_ssid}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                          <span>
                            성공률: {Math.round(place.success_rate * 100)}% (
                            {place.success_count}/{place.total_count}회)
                          </span>
                          {place.last_used_at && (
                            <span>
                              • 마지막: {formatDate(place.last_used_at)} ✅
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedPlaceId === place.place_id && (
                        <div className="text-indigo-600 text-xl">✓</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 새 장소 등록 버튼 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRegistration(true)}
            fullWidth
          >
            + 새 장소 등록하기
          </Button>

          {/* 장소 상관없음 */}
          <div
            onClick={() => {
              setSkipLocation(!skipLocation);
              if (!skipLocation) setSelectedPlaceId(null);
            }}
            className={`
              border rounded-md p-3 cursor-pointer transition-all
              ${
                skipLocation
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-indigo-300"
              }
            `}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                checked={skipLocation}
                onChange={() => {}}
                className="cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700">
                ○ 장소 상관없음 (위치 인증 건너뛰기)
              </span>
            </div>
          </div>

          {/* 저장/취소 버튼 */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button variant="outline" size="sm" onClick={onCancel}>
              취소
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              확인
            </Button>
          </div>
        </div>
      </Card>

      {/* 장소 등록 모달 */}
      {showRegistration && (
        <PlaceRegistrationForm
          userId={userId}
          onSave={handlePlaceRegistered}
          onCancel={() => setShowRegistration(false)}
        />
      )}
    </div>
  );
};

// 날짜 포맷 헬퍼
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default MissionLocationConfig;
