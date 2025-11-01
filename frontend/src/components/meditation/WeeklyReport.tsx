/**
 * Weekly Report Component
 * Visualize meditation progress with charts
 */

import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getWeeklyReport, type WeeklyReport } from "../../services/meditation/sessionStore";

export const WeeklyReportCard: React.FC = () => {
  const [report, setReport] = useState<WeeklyReport | null>(null);

  useEffect(() => {
    const data = getWeeklyReport();
    setReport(data);
  }, []);

  if (!report || report.sessions.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-bold text-gray-700 mb-2">주간 리포트</h3>
        <p className="text-gray-500">아직 세션 데이터가 없습니다.</p>
        <p className="text-sm text-gray-400 mt-2">
          명상을 시작하면 여기에 진행 상황이 표시됩니다.
        </p>
      </div>
    );
  }

  // Prepare chart data
  const chartData = report.sessions
    .slice(0, 10)
    .reverse()
    .map((session, idx) => ({
      name: `세션 ${idx + 1}`,
      품질: session.qualityScore,
      긴장도: Math.round(session.avgTension * 100),
      호흡: Math.round(session.avgBreathRate),
    }));

  const formatDuration = (sec: number): string => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  };

  const getTrendEmoji = (value: number): string => {
    if (value > 5) return "📈";
    if (value < -5) return "📉";
    return "➡️";
  };

  const getTrendColor = (value: number, inverse = false): string => {
    const isPositive = inverse ? value < 0 : value > 0;
    if (Math.abs(value) < 5) return "text-gray-600";
    return isPositive ? "text-green-600" : "text-red-600";
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-3xl shadow-lg p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">📊</div>
        <h3 className="text-2xl font-bold text-gray-800">주간 리포트</h3>
        <p className="text-sm text-gray-600">
          {new Date(report.weekStart).toLocaleDateString("ko-KR")} ~{" "}
          {new Date(report.weekEnd).toLocaleDateString("ko-KR")}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 text-center shadow">
          <div className="text-sm text-gray-500 mb-1">총 세션</div>
          <div className="text-3xl font-bold text-purple-600">
            {report.totalSessions}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 text-center shadow">
          <div className="text-sm text-gray-500 mb-1">총 시간</div>
          <div className="text-3xl font-bold text-blue-600">
            {formatDuration(report.totalDuration)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 text-center shadow">
          <div className="text-sm text-gray-500 mb-1">평균 품질</div>
          <div className="text-3xl font-bold text-green-600">
            {Math.round(report.avgQualityScore)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 text-center shadow">
          <div className="text-sm text-gray-500 mb-1">일 평균</div>
          <div className="text-3xl font-bold text-orange-600">
            {(report.totalSessions / 7).toFixed(1)}
          </div>
        </div>
      </div>

      {/* Trends */}
      <div className="bg-white rounded-2xl p-4 mb-6 shadow">
        <h4 className="text-lg font-bold text-gray-700 mb-3">📈 트렌드</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">명상 품질</span>
            <span className={`font-bold ${getTrendColor(report.trends.qualityImprovement)}`}>
              {getTrendEmoji(report.trends.qualityImprovement)}{" "}
              {report.trends.qualityImprovement > 0 ? "+" : ""}
              {report.trends.qualityImprovement.toFixed(1)}%
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600">긴장도 감소</span>
            <span className={`font-bold ${getTrendColor(report.trends.tensionReduction)}`}>
              {getTrendEmoji(report.trends.tensionReduction)}{" "}
              {report.trends.tensionReduction > 0 ? "+" : ""}
              {report.trends.tensionReduction.toFixed(1)}%
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600">호흡 개선</span>
            <span
              className={`font-bold ${getTrendColor(report.trends.breathRateImprovement)}`}
            >
              {getTrendEmoji(report.trends.breathRateImprovement)}{" "}
              {report.trends.breathRateImprovement > 0 ? "+" : ""}
              {report.trends.breathRateImprovement.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h4 className="text-lg font-bold text-gray-700 mb-3">📉 진행 상황</h4>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="품질"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="긴장도"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="호흡"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <div className="mt-6 bg-gradient-to-r from-purple-100 to-blue-100 rounded-2xl p-4">
        <h4 className="text-md font-bold text-gray-700 mb-2">💡 인사이트</h4>
        <div className="text-sm text-gray-600 space-y-1">
          {report.totalSessions >= 7 && (
            <p>🔥 매일 명상을 유지하고 있어요! 훌륭합니다.</p>
          )}
          {report.avgQualityScore >= 80 && (
            <p>⭐ 일관되게 높은 품질을 유지하고 있습니다.</p>
          )}
          {report.trends.qualityImprovement > 10 && (
            <p>📈 명상 품질이 크게 개선되었습니다!</p>
          )}
          {report.totalSessions < 3 && (
            <p>🌱 좋은 시작입니다! 꾸준히 해보세요.</p>
          )}
          {report.trends.tensionReduction > 15 && (
            <p>😌 긴장도가 많이 줄어들었습니다. 효과를 느끼고 계시네요!</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyReportCard;
