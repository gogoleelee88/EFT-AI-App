// 사진 인증 상세 설정 컴포넌트
import React, { useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type { PhotoMissionConfig, PhotoRecommendation } from "../../types/mission";
import PhotoExampleGallery from "./PhotoExampleGallery";

interface MissionPhotoConfigProps {
  aiRecommendations?: PhotoRecommendation[];
  initialConfig?: PhotoMissionConfig;
  onSave: (config: PhotoMissionConfig) => void;
  onCancel: () => void;
}

const MissionPhotoConfig: React.FC<MissionPhotoConfigProps> = ({
  aiRecommendations = [],
  initialConfig,
  onSave,
  onCancel,
}) => {
  const [selectedRecommendation, setSelectedRecommendation] = useState<
    PhotoRecommendation | null
  >(null);
  const [customRequirement, setCustomRequirement] = useState(
    initialConfig?.requirement || ""
  );
  const [showGallery, setShowGallery] = useState(false);

  const handleSave = () => {
    let config: PhotoMissionConfig;

    if (selectedRecommendation) {
      config = selectedRecommendation.config;
    } else {
      if (!customRequirement.trim()) {
        alert("무엇을 찍을지 입력하세요.");
        return;
      }
      config = {
        requirement: customRequirement.trim(),
        description: customRequirement.trim(),
      };
    }

    onSave(config);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800">📸 사진 인증 설정</h3>

          {/* AI 추천 옵션 */}
          {aiRecommendations.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                🤖 AI 추천 (탭하면 선택)
              </div>
              <div className="space-y-2">
                {aiRecommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedRecommendation(rec)}
                    className={`
                      border rounded-md p-3 cursor-pointer transition-all
                      ${
                        selectedRecommendation === rec
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        checked={selectedRecommendation === rec}
                        onChange={() => setSelectedRecommendation(rec)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {rec.label}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {rec.description}
                        </div>
                        <div className="text-xs text-indigo-600 mt-1">
                          {rec.verification_description}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 직접 설정 */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">
              ✏️ 내가 직접 정하기
            </div>
            <input
              type="text"
              value={customRequirement}
              onChange={(e) => {
                setCustomRequirement(e.target.value);
                setSelectedRecommendation(null); // AI 추천 해제
              }}
              placeholder="예: 손글씨 + 펜 + 문제집"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 예시 사진 보기 */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGallery(true)}
            >
              📋 예시 사진 보기
            </Button>
          </div>

          {/* 저장/취소 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              취소
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              확인
            </Button>
          </div>
        </div>
      </Card>

      {/* 예시 사진 갤러리 모달 */}
      {showGallery && (
        <PhotoExampleGallery onClose={() => setShowGallery(false)} />
      )}
    </div>
  );
};

export default MissionPhotoConfig;
