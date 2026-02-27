import React from "react";
import LoginPage from "./pages/LoginPage";
import RootLanding from "./pages/RootLanding";
import Dashboard from "./pages/Dashboard";
import ARDemo from "./pages/ARDemo";
import ARTest from "./pages/ARTest";
// ARHolisticTest_게이밍네이션0128tsx 파일은 확장자가 없어 esbuild 오류 발생.
// 파일명을 ARHolisticTest_게이밍네이션0128.tsx 로 바꾼 뒤 아래를 다시 사용하세요:
// import ARHolisticTest from "./pages/ARHolisticTest_게이밍네이션0128";
import ARHolisticTest from "./pages/ARHolisticTest";
import ArCalibrationPage from "./pages/ArCalibrationPage";
import { EFTStrictPage } from "./pages/EFTStrictPage";
import AIChat from "./components/feature/AIChat";
import EmotionSessionsListPage from "./pages/EmotionSessionsListPage";
import EmotionSessionDetailPage from "./pages/EmotionSessionDetailPage";
import InsightsPage from "./pages/InsightsPage";
import InsightDetailPage from "./pages/InsightDetailPage";
import TriModalMeditation from "./components/meditation/TriModalMeditation";
import ARBoxBreathingPage from "./pages/ARBoxBreathingPage";
import MeditationThemePage from "./pages/MeditationThemePage";
import MeditationSessionPage from "./pages/MeditationSessionPage";
import MeditationRunPage from "./pages/MeditationRunPage";
import PlanDayPage from "./pages/PlanDayPage";
import InstallGuidePage from "./pages/InstallGuidePage";
import CheckinRebalancePage from "./pages/CheckinRebalancePage";
import ResistanceEventPage from "./pages/ResistanceEventPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import SignalInboxPage from "./pages/SignalInboxPage";
import MorningBriefPage from "./pages/MorningBriefPage";
import ExecuteBoardPage from "./pages/ExecuteBoardPage";
import ChatRoomsPage from "./pages/ChatRoomsPage";
import ChatRoomPage, { ChatInvitePage } from "./pages/ChatRoomPage";
import DecisionMirrorPage from "./pages/DecisionMirrorPage";
import DemoStartPage from "./pages/DemoStartPage";
import DemoResultPage from "./pages/DemoResultPage";
import FeedbackPage from "./pages/FeedbackPage";
import SessionAdvicePage from "./pages/SessionAdvicePage";
import MealCoachPage from "./pages/MealCoachPage";
import MenstrualModulePage from "./pages/MenstrualModulePage";
import MenstrualOutputsPage from "./pages/MenstrualOutputsPage";
import OpenChatPage from "./pages/OpenChatPage";
import ConditionHubPage from "./pages/ConditionHubPage";
import ConditionModulePage from "./pages/ConditionModulePage";
import WorkGuideDemoPage from "./pages/WorkGuideDemoPage";
import { Routes, Route, Navigate } from "react-router-dom";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootLanding />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/plan/day" element={<PlanDayPage />} />
      <Route path="/profile-setup" element={<ProfileSetupPage />} />
      <Route path="/my-page" element={<ProfileSetupPage />} />
      <Route path="/add-alarm" element={<PlanDayPage />} />
      <Route path="/signal-inbox" element={<SignalInboxPage />} />
      <Route path="/morning-brief" element={<MorningBriefPage />} />
      <Route path="/execute-board" element={<ExecuteBoardPage />} />
      <Route path="/checkin" element={<CheckinRebalancePage />} />
      <Route path="/condition" element={<ConditionHubPage />} />
      <Route path="/condition/module/:metricKey" element={<ConditionModulePage />} />
      <Route path="/resistance" element={<ResistanceEventPage />} />
      <Route path="/eft-strict" element={<EFTStrictPage />} />
      <Route path="/ai-chat" element={<AIChat />} />
      <Route path="/demo" element={<DemoStartPage />} />
      <Route path="/demo/result" element={<DemoResultPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/session/advice" element={<SessionAdvicePage />} />
      <Route path="/meal-coach/*" element={<MealCoachPage />} />
      <Route path="/menstrual" element={<MenstrualModulePage />} />
      <Route path="/menstrual/outputs" element={<MenstrualOutputsPage />} />
      <Route path="/openchat" element={<OpenChatPage />} />
      <Route path="/work-guide-demo" element={<WorkGuideDemoPage />} />
      <Route path="/emotion-sessions" element={<EmotionSessionsListPage />} />
      <Route path="/emotion-sessions/:id" element={<EmotionSessionDetailPage />} />
      <Route path="/insights" element={<InsightsPage />} />
      <Route path="/insights/:id" element={<InsightDetailPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<LoginPage />} />

      <Route path="/chat/rooms" element={<ChatRoomsPage />} />
      <Route path="/chat/rooms/:roomId" element={<ChatRoomPage />} />
      <Route path="/chat/rooms/:roomId/decision-mirror" element={<DecisionMirrorPage />} />
      <Route path="/chat/invite/:inviteToken" element={<ChatInvitePage />} />

      <Route path="/ar-demo" element={<ARDemo />} />
      <Route path="/ar-test" element={<ARTest />} />
      <Route path="/ar-holistic" element={<ARHolisticTest />} />
      <Route path="/eftar" element={<ARHolisticTest />} />
      <Route path="/ar-box-breathing" element={<ARBoxBreathingPage />} />
      <Route path="/ar-calibration" element={<ArCalibrationPage />} />

      <Route path="/meditation" element={<TriModalMeditation />} />
      <Route path="/meditation/theme" element={<MeditationThemePage />} />
      <Route path="/meditation/session" element={<MeditationSessionPage />} />
      <Route path="/meditation/run" element={<MeditationRunPage />} />
      <Route path="/install-guide" element={<InstallGuidePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
