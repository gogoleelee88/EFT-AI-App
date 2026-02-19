// 사진 업로드 폼 컴포넌트
import React, { useState } from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";
import type { MissionConfig, PhotoMissionConfig } from "../../types/mission";

interface PhotoUploadFormProps {
  dayId: number;
  mission: MissionConfig;
  onSuccess: (key: string) => void;
  onFail: (key: string) => void;
  onCancel: () => void;
  userId?: string;
  missionRunId?: string;
}

const PhotoUploadForm: React.FC<PhotoUploadFormProps> = ({
  dayId,
  mission,
  onSuccess,
  onFail,
  onCancel,
  userId,
  missionRunId,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const config = mission.config as PhotoMissionConfig;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("사진을 선택하세요.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("day_id", dayId.toString());
      formData.append("requirement", config.requirement);
      if (config.ocr_keywords) {
        formData.append("ocr_keywords", JSON.stringify(config.ocr_keywords));
      }
      if (config.objects_required) {
        formData.append("objects_required", JSON.stringify(config.objects_required));
      }
      if (userId) {
        formData.append("user_id", userId);
      }
      if (missionRunId) {
        formData.append("mission_run_id", missionRunId);
      }

      const response = await fetch("/api/spec/missions/verify/photo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();
      setResult(data);

      if (data.passed) {
        setTimeout(() => {
          onSuccess(`photo_0`);
        }, 1500);
      } else {
        onFail(`photo_0`);
      }
    } catch (err) {
      alert("사진 검증 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="max-w-md w-full">
        <Card>
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">📸 사진 인증</h3>

            {/* 요구사항 표시 */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="text-sm font-medium text-blue-900">필요한 것:</div>
              <div className="text-sm text-blue-800 mt-1">{config.requirement}</div>
              {config.description && (
                <div className="text-xs text-blue-700 mt-1">{config.description}</div>
              )}
            </div>

            {/* 파일 선택 */}
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="w-full text-sm"
              />

              {/* 미리보기 */}
              {previewUrl && (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-64 object-contain bg-gray-100"
                  />
                </div>
              )}
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
                  {result.passed ? "✅ 검증 통과" : "❌ 검증 실패"}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    result.passed ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {result.reason}
                </div>
                {result.detected_objects?.length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    발견된 객체: {result.detected_objects.join(", ")}
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
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                fullWidth
              >
                {uploading ? "검증 중..." : "업로드 및 검증"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PhotoUploadForm;
