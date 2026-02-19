import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  getCommonInsightById,
  getPersonalInsightById,
  getInsightTitle,
} from '../data/insights';

const InsightDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const decodedId = id ? decodeURIComponent(id) : '';

  const numId = decodedId ? parseInt(decodedId, 10) : NaN;
  const isCommon = !Number.isNaN(numId);
  const common = isCommon ? getCommonInsightById(numId) : undefined;
  const personal = !isCommon ? getPersonalInsightById(decodedId) : undefined;

  const title = common?.title ?? personal?.title ?? getInsightTitle(decodedId as string | number);
  const description = common?.description ?? personal?.description;
  const progress = common?.progress;
  const confidence = personal?.confidence;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50">
      <div className="bg-white shadow border-b border-indigo-100 sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/insights')}
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="통찰 목록으로"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">통찰</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-8">
        <Card>
          <div className="space-y-3">
            <div className="font-bold text-gray-800 text-lg">🔮 {title}</div>
            {progress != null && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>진행률 {progress}%</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            {confidence != null && (
              <div className="text-sm text-purple-600">신뢰도 {confidence}%</div>
            )}
            {description && (
              <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
            )}
          </div>
        </Card>

        <Button variant="outline" fullWidth onClick={() => navigate('/insights')}>
          통찰 목록으로
        </Button>
        <Button variant="primary" fullWidth onClick={() => navigate('/dashboard')}>
          대시보드로
        </Button>
      </div>
    </div>
  );
};

export default InsightDetailPage;
