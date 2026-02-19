import React, { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type {
  Place,
  PlaceCreateRequest,
  PlaceSearchResult,
} from "../../types/mission";
import {
  createPlace,
  getCurrentPosition,
  detectBluetoothBeacons,
  searchPlaceCandidates,
} from "../../services/missionService";

interface PlaceRegistrationFormProps {
  userId?: string;
  onSave: (place: Place) => void;
  onCancel: () => void;
}

const PlaceRegistrationForm: React.FC<PlaceRegistrationFormProps> = ({
  userId,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searchSortMode, setSearchSortMode] = useState<"relevance" | "distance">(
    "relevance"
  );
  const [sortOrigin, setSortOrigin] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [selectedSearchKey, setSelectedSearchKey] = useState<string | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string>("");
  const [selectedPlaceAddress, setSelectedPlaceAddress] = useState<string>("");
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [gpsSource, setGpsSource] = useState<"search" | "current" | null>(null);
  const [wifiEnabled, setWifiEnabled] = useState(false);
  const [wifiSsid, setWifiSsid] = useState("");
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [bluetoothBeaconId, setBluetoothBeaconId] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [locatingForSort, setLocatingForSort] = useState(false);
  const [searchingBeacon, setSearchingBeacon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSearchItemKey = (item: PlaceSearchResult): string => {
    if (item.provider_id) {
      return `${item.provider}:${item.provider_id}`;
    }
    return `${item.provider}:${item.place_name}:${item.lat}:${item.lng}`;
  };

  const toRadians = (deg: number): number => (deg * Math.PI) / 180;

  const getDistanceM = (
    origin: { lat: number; lng: number },
    target: { lat: number; lng: number }
  ): number => {
    const earthRadiusM = 6371000;
    const lat1 = toRadians(origin.lat);
    const lat2 = toRadians(target.lat);
    const deltaLat = toRadians(target.lat - origin.lat);
    const deltaLng = toRadians(target.lng - origin.lng);
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusM * c;
  };

  const displaySearchResults = useMemo(() => {
    if (searchSortMode !== "distance" || !sortOrigin) {
      return searchResults;
    }

    return [...searchResults].sort((a, b) => {
      const distanceA = getDistanceM(sortOrigin, { lat: a.lat, lng: a.lng });
      const distanceB = getDistanceM(sortOrigin, { lat: b.lat, lng: b.lng });
      return distanceA - distanceB;
    });
  }, [searchResults, searchSortMode, sortOrigin]);

  const formatDistanceLabel = (item: PlaceSearchResult): string | null => {
    if (!sortOrigin) return null;
    const distanceM = getDistanceM(sortOrigin, { lat: item.lat, lng: item.lng });
    if (distanceM >= 1000) {
      return `${(distanceM / 1000).toFixed(1)}km`;
    }
    return `${Math.round(distanceM)}m`;
  };

  const handleSearchPlaces = async () => {
    const keyword = searchQuery.trim();
    if (!keyword) {
      setError("주소 또는 상호명을 입력해주세요.");
      return;
    }

    setSearchingPlace(true);
    setError(null);
    try {
      const results = await searchPlaceCandidates(keyword, 8);
      setSearchResults(results);
      if (results.length === 0) {
        setError("검색 결과가 없습니다. 다른 주소/상호명으로 다시 시도해주세요.");
      }
    } catch (err) {
      setSearchResults([]);
      setError("장소 검색에 실패했습니다. 잠시 후 다시 시도해주세요.");
      if (err instanceof Error && err.message.trim()) {
        setError(err.message);
      }
    } finally {
      setSearchingPlace(false);
    }
  };

  const handleSelectPlace = (item: PlaceSearchResult, key: string) => {
    const displayAddress = item.road_address || item.address || "";
    setSelectedSearchKey(key);
    setName(item.place_name);
    setSearchQuery(item.place_name);
    setAddress(displayAddress);
    setSelectedPlaceName(item.place_name);
    setSelectedPlaceAddress(displayAddress);
    setGpsCoords({ lat: item.lat, lng: item.lng });
    setGpsEnabled(true);
    setGpsSource("search");
    setSearchResults([]);
    setError(null);
  };

  const handleChangeSearchSortMode = async (
    mode: "relevance" | "distance"
  ) => {
    setSearchSortMode(mode);
    if (mode === "relevance") {
      return;
    }

    if (sortOrigin) {
      return;
    }

    setLocatingForSort(true);
    setError(null);
    try {
      const coords = await getCurrentPosition();
      setSortOrigin(coords);
    } catch {
      setError("가까운순 정렬을 위해 현재 위치 권한이 필요합니다.");
      setSearchSortMode("relevance");
    } finally {
      setLocatingForSort(false);
    }
  };

  const handleGetCurrentLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const coords = await getCurrentPosition();
      setGpsCoords(coords);
      setGpsEnabled(true);
      setSelectedSearchKey(null);
      setSelectedPlaceName("현재 위치");
      setSelectedPlaceAddress("");
      setGpsSource("current");
    } catch (err) {
      setError("현재 위치를 가져오지 못했습니다. 브라우저 위치 권한을 확인해주세요.");
    } finally {
      setLocating(false);
    }
  };

  const clearCurrentPlaceRegistration = () => {
    setGpsEnabled(false);
    setGpsCoords(null);
    setGpsSource(null);
  };

  const handleSearchBeacon = async () => {
    setSearchingBeacon(true);
    setError(null);
    try {
      const beacons = await detectBluetoothBeacons();
      if (beacons.length > 0) {
        setBluetoothBeaconId(beacons[0]);
        setBluetoothEnabled(true);
      } else {
        setError("Bluetooth 기기를 찾을 수 없습니다.");
      }
    } catch (err) {
      setError("Bluetooth 검색에 실패했습니다.");
    } finally {
      setSearchingBeacon(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("장소 이름을 입력해주세요.");
      return;
    }

    if (gpsEnabled && !gpsCoords) {
      setError("현재 장소 인증을 사용하려면 위치를 먼저 등록해주세요.");
      return;
    }

    const verificationMethod: ("gps" | "wifi" | "bluetooth")[] = [];
    if (gpsEnabled) verificationMethod.push("gps");
    if (wifiEnabled) verificationMethod.push("wifi");
    if (bluetoothEnabled) verificationMethod.push("bluetooth");

    if (verificationMethod.length === 0) {
      setError("위치 확인 방법을 최소 1개 이상 선택해주세요.");
      return;
    }

    const request: PlaceCreateRequest = {
      name: name.trim(),
      address: address.trim() || undefined,
      gps_lat: gpsCoords?.lat,
      gps_lng: gpsCoords?.lng,
      gps_radius: 50,
      wifi_ssid: wifiEnabled ? wifiSsid.trim() || undefined : undefined,
      bluetooth_beacon_id: bluetoothEnabled
        ? bluetoothBeaconId.trim() || undefined
        : undefined,
      verification_method: verificationMethod,
    };

    setSaving(true);
    setError(null);
    try {
      const newPlace = await createPlace(request, userId);
      onSave(newPlace);
    } catch (err) {
      setError("장소 등록에 실패했습니다. 입력값을 확인하고 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md">
        <Card>
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">새 장소 등록</h3>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                장소 이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 스타벅스 B지점"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                주소/상호명으로 검색
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearchPlaces();
                    }
                  }}
                  placeholder="예: 강남구 테헤란로 123, 스타벅스"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSearchPlaces}
                  disabled={searchingPlace}
                >
                  {searchingPlace ? "검색 중..." : "검색"}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500">
                  검색 결과를 선택하면 장소 이름과 좌표가 자동 입력됩니다.
                </div>
                <select
                  value={searchSortMode}
                  onChange={(e) =>
                    void handleChangeSearchSortMode(
                      e.target.value as "relevance" | "distance"
                    )
                  }
                  disabled={searchingPlace || locatingForSort}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="장소 검색 정렬"
                >
                  <option value="relevance">관련도순</option>
                  <option value="distance">가까운순</option>
                </select>
              </div>
              {locatingForSort && (
                <div className="text-[11px] text-gray-500">
                  가까운순 정렬을 위해 현재 위치를 확인하는 중입니다...
                </div>
              )}
              <div className="text-xs text-gray-500">
                정렬 기준은 검색 결과 표시에만 적용됩니다.
              </div>
            </div>

            {displaySearchResults.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                {displaySearchResults.map((item) => {
                  const key = getSearchItemKey(item);
                  const selected = selectedSearchKey === key;
                  const displayAddress = item.road_address || item.address;
                  const distanceLabel = formatDistanceLabel(item);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectPlace(item, key)}
                      className={`w-full px-3 py-2 text-left transition-colors ${
                        selected
                          ? "bg-indigo-50 ring-1 ring-indigo-300"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-800">
                          {item.place_name}
                        </div>
                        <div className="flex items-center gap-1">
                          {searchSortMode === "distance" && distanceLabel && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              {distanceLabel}
                            </span>
                          )}
                          {selected && (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                              선택됨
                            </span>
                          )}
                        </div>
                      </div>
                      {displayAddress && (
                        <div className="mt-1 text-xs text-gray-600">
                          주소: {displayAddress}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        GPS: 위도 {item.lat.toFixed(6)}, 경도 {item.lng.toFixed(6)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {(selectedPlaceName || address) && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <div className="font-medium">
                  선택된 장소: {name || selectedPlaceName || "미지정"}
                </div>
                {(address || selectedPlaceAddress) && (
                  <div className="mt-1">
                    주소: {address || selectedPlaceAddress}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-700">
                위치 확인 방법 (최소 1개 선택)
              </div>

              <div className="space-y-2 rounded-md border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-700">현재 장소 등록</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGetCurrentLocation}
                      disabled={locating || saving}
                    >
                      {locating
                        ? "현재 장소 확인 중..."
                        : gpsEnabled
                          ? "현재 장소 다시 등록"
                          : "현재 장소 등록"}
                    </Button>
                    {gpsEnabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearCurrentPlaceRegistration}
                        disabled={saving}
                      >
                        등록 해제
                      </Button>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-600">
                  버튼을 누르면 현재 위치가 등록되고 GPS 인증이 자동 활성화됩니다.
                </div>

                {gpsEnabled && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">
                      {gpsSource === "search" &&
                        "검색한 장소가 현재 장소로 등록되어 있습니다."}
                      {gpsSource === "current" &&
                        "현재 내 위치가 현재 장소로 등록되어 있습니다."}
                    </div>
                    {gpsCoords && (
                      <div className="text-xs text-green-600">
                        등록된 위치 좌표: 위도 {gpsCoords.lat.toFixed(6)}, 경도{" "}
                        {gpsCoords.lng.toFixed(6)}
                      </div>
                    )}
                    {gpsSource === "search" && (
                      <div className="text-[11px] text-gray-500">
                        검색 장소 대신 현재 내 위치로 바꾸려면 다시 등록 버튼을 누르세요.
                      </div>
                    )}
                    <div className="text-xs text-gray-500">허용 반경: 50m</div>
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={wifiEnabled}
                    onChange={(e) => setWifiEnabled(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700">Wi-Fi</span>
                </div>
                {wifiEnabled && (
                  <div className="ml-6 space-y-2">
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="Wi-Fi SSID 입력 (예: studycafe_5G)"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <div className="text-xs text-gray-500">
                      브라우저에서는 자동 감지가 어려워 SSID를 직접 입력해야 할 수 있습니다.
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bluetoothEnabled}
                    onChange={(e) => setBluetoothEnabled(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Bluetooth Beacon
                  </span>
                </div>
                {bluetoothEnabled && (
                  <div className="ml-6 space-y-2">
                    {bluetoothBeaconId ? (
                      <div className="text-xs text-green-600">
                        Beacon ID: {bluetoothBeaconId}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSearchBeacon}
                        disabled={searchingBeacon || saving}
                      >
                        {searchingBeacon ? "검색 중..." : "비콘 검색"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-2">
              <Button variant="outline" size="md" onClick={onCancel}>
                취소
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PlaceRegistrationForm;
