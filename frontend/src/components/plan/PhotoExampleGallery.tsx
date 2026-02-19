// 예시 사진 갤러리 컴포넌트
import React from "react";
import { Button } from "../ui/Button";
import Card from "../ui/Card";

interface PhotoExampleGalleryProps {
  onClose: () => void;
}

// 임시 예시 사진 데이터 (실제로는 서버에서 가져오거나 assets에 저장)
const EXAMPLE_PHOTOS = [
  {
    id: 1,
    title: "손글씨 + 펜",
    description: "노트에 적힌 공식과 펜이 함께 보이는 사진",
    imageUrl: "https://via.placeholder.com/300x200?text=손글씨+펜",
  },
  {
    id: 2,
    title: "문제집 표지",
    description: "문제집을 펼쳐놓은 모습",
    imageUrl: "https://via.placeholder.com/300x200?text=문제집+표지",
  },
  {
    id: 3,
    title: "준비된 책상",
    description: "노트, 교재, 필기구가 정리된 책상",
    imageUrl: "https://via.placeholder.com/300x200?text=준비된+책상",
  },
  {
    id: 4,
    title: "타이머 설정",
    description: "타이머를 켜고 시작하는 사진",
    imageUrl: "https://via.placeholder.com/300x200?text=타이머+설정",
  },
];

const PhotoExampleGallery: React.FC<PhotoExampleGalleryProps> = ({
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                📋 예시 사진 보기
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXAMPLE_PHOTOS.map((photo) => (
                <div
                  key={photo.id}
                  className="border border-gray-200 rounded-md overflow-hidden hover:border-indigo-300 transition-all"
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.title}
                    className="w-full h-40 object-cover bg-gray-100"
                  />
                  <div className="p-3 space-y-1">
                    <div className="font-medium text-sm text-gray-800">
                      {photo.title}
                    </div>
                    <div className="text-xs text-gray-600">
                      {photo.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-200">
              <Button variant="primary" size="md" onClick={onClose}>
                닫기
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PhotoExampleGallery;
