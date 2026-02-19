// 시간 확인 상세 설정 컴포넌트
import React, { useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type { TimeMissionConfig } from "../../types/mission";

interface MissionTimeConfigProps {
  initialConfig?: TimeMissionConfig;
  onSave: (config: TimeMissionConfig) => void;
  onCancel: () => void;
}

const MissionTimeConfig: React.FC<MissionTimeConfigProps> = ({
  initialConfig,
  onSave,
  onCancel,
}) => {
  const [time, setTime] = useState(initialConfig?.time || "19:00");
  const [checkTypes, setCheckTypes] = useState<("screen_capture" | "photo")[]>(
    initialConfig?.check_type || ["screen_capture"]
  );
  const [screenChecks, setScreenChecks] = useState({
    check_app_running: initialConfig?.screen_requirements?.check_app_running || false,
    app_name: initialConfig?.screen_requirements?.app_name || "",
    check_file_open: initialConfig?.screen_requirements?.check_file_open || false,
    file_pattern: initialConfig?.screen_requirements?.file_pattern || "",
    check_file_modified: initialConfig?.screen_requirements?.check_file_modified || false,
    modified_within_minutes:
      initialConfig?.screen_requirements?.modified_within_minutes || 10,
  });
  const [notificationMode, setNotificationMode] = useState<"silent" | "push">(
    initialConfig?.notification_mode || "push"
  );

  const toggleCheckType = (type: "screen_capture" | "photo") => {
    if (checkTypes.includes(type)) {
      setCheckTypes((prev) => prev.filter((t) => t !== type));
    } else {
      setCheckTypes((prev) => [...prev, type]);
    }
  };

  const handleSave = () => {
    if (!time) {
      alert("시간을 선택하세요.");
      return;
    }

    if (checkTypes.length === 0) {
      alert("확인 방법을 최소 1개 선택하세요.");
      return;
    }

    const config: TimeMissionConfig = {
      time,
      check_type: checkTypes,
      notification_mode: notificationMode,
    };

    // 화면 캡처 옵션이 선택된 경우 screen_requirements 추가
    if (checkTypes.includes("screen_capture")) {
      config.screen_requirements = screenChecks;
    }

    onSave(config);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800">⏰ 시간 확인 설정</h3>

          {/* 시간 선택 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              언제 확인할까요?
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 확인 방법 */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">
              무엇을 확인할까요?
            </div>

            {/* 화면 캡처 인증 */}
            <div className="border border-gray-200 rounded-md p-3 space-y-3">
              <div
                onClick={() => toggleCheckType("screen_capture")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checkTypes.includes("screen_capture")}
                  onChange={() => {}}
                  className="cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">
                  화면 캡처 인증
                </span>
              </div>

              {checkTypes.includes("screen_capture") && (
                <div className="ml-6 space-y-3 border-l-2 border-indigo-100 pl-4">
                  <div className="text-xs text-gray-600">
                    작업 중인 화면 자동 확인
                  </div>

                  {/* 특정 앱 실행 중 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={screenChecks.check_app_running}
                        onChange={(e) =>
                          setScreenChecks((prev) => ({
                            ...prev,
                            check_app_running: e.target.checked,
                          }))
                        }
                        className="cursor-pointer"
                      />
                      <span className="text-xs text-gray-700">
                        특정 앱 실행 중
                      </span>
                    </div>
                    {screenChecks.check_app_running && (
                      <input
                        type="text"
                        value={screenChecks.app_name}
                        onChange={(e) =>
                          setScreenChecks((prev) => ({
                            ...prev,
                            app_name: e.target.value,
                          }))
                        }
                        placeholder="예: PDF 뷰어, 문제집 앱"
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs ml-6"
                      />
                    )}
                  </div>

                  {/* 특정 파일 열림 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={screenChecks.check_file_open}
                        onChange={(e) =>
                          setScreenChecks((prev) => ({
                            ...prev,
                            check_file_open: e.target.checked,
                          }))
                        }
                        className="cursor-pointer"
                      />
                      <span className="text-xs text-gray-700">
                        특정 파일 열림
                      </span>
                    </div>
                    {screenChecks.check_file_open && (
                      <input
                        type="text"
                        value={screenChecks.file_pattern}
                        onChange={(e) =>
                          setScreenChecks((prev) => ({
                            ...prev,
                            file_pattern: e.target.value,
                          }))
                        }
                        placeholder="예: 수학_문제집.pdf"
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs ml-6"
                      />
                    )}
                  </div>

                  {/* 파일 수정 시간 확인 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={screenChecks.check_file_modified}
                        onChange={(e) =>
                          setScreenChecks((prev) => ({
                            ...prev,
                            check_file_modified: e.target.checked,
                          }))
                        }
                        className="cursor-pointer"
                      />
                      <span className="text-xs text-gray-700">
                        파일 수정 시간 확인
                      </span>
                    </div>
                    {screenChecks.check_file_modified && (
                      <div className="flex items-center gap-2 ml-6">
                        <span className="text-xs text-gray-600">최근</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={screenChecks.modified_within_minutes}
                          onChange={(e) =>
                            setScreenChecks((prev) => ({
                              ...prev,
                              modified_within_minutes: Number(e.target.value),
                            }))
                          }
                          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs text-center"
                        />
                        <span className="text-xs text-gray-600">분 내 수정됨</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 사진 인증 */}
            <div className="border border-gray-200 rounded-md p-3">
              <div
                onClick={() => toggleCheckType("photo")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checkTypes.includes("photo")}
                  onChange={() => {}}
                  className="cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">
                  사진 인증
                </span>
              </div>
              {checkTypes.includes("photo") && (
                <div className="ml-6 mt-2 text-xs text-gray-600">
                  설정한 시간에 직접 사진 촬영
                </div>
              )}
            </div>
          </div>

          {/* 알림 방식 */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">알림 방식</div>
            <div className="flex gap-2">
              <div
                onClick={() => setNotificationMode("silent")}
                className={`
                  flex-1 border rounded-md p-3 cursor-pointer transition-all
                  ${
                    notificationMode === "silent"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }
                `}
              >
                <input
                  type="radio"
                  checked={notificationMode === "silent"}
                  onChange={() => {}}
                  className="cursor-pointer mr-2"
                />
                <span className="text-sm">조용히 확인 (백그라운드)</span>
              </div>
              <div
                onClick={() => setNotificationMode("push")}
                className={`
                  flex-1 border rounded-md p-3 cursor-pointer transition-all
                  ${
                    notificationMode === "push"
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }
                `}
              >
                <input
                  type="radio"
                  checked={notificationMode === "push"}
                  onChange={() => {}}
                  className="cursor-pointer mr-2"
                />
                <span className="text-sm">알림 띄우기 (푸시)</span>
              </div>
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
    </div>
  );
};

export default MissionTimeConfig;
