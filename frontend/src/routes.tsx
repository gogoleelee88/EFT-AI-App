import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import {
  buildAddAlarmHref,
  buildPlannerHref,
  type PlannerTab,
} from "./utils/plannerRoutes";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const MobileLinkPage = lazy(() => import("./pages/MobileLinkPage"));
const RootLanding = lazy(() => import("./pages/RootLanding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ARDemo = lazy(() => import("./pages/ARDemo"));
const ARTest = lazy(() => import("./pages/ARTest"));
const ARHolisticTest = lazy(() => import("./pages/ARHolisticTest"));
const ArCalibrationPage = lazy(() => import("./pages/ArCalibrationPage"));
const EFTStrictPage = lazy(() =>
  import("./pages/EFTStrictPage").then((module) => ({ default: module.EFTStrictPage }))
);
const AIChat = lazy(() => import("./components/feature/AIChat"));
const EmotionSessionsListPage = lazy(() => import("./pages/EmotionSessionsListPage"));
const EmotionSessionDetailPage = lazy(() => import("./pages/EmotionSessionDetailPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const InsightDetailPage = lazy(() => import("./pages/InsightDetailPage"));
const TriModalMeditation = lazy(() => import("./components/meditation/TriModalMeditation"));
const ARBoxBreathingPage = lazy(() => import("./pages/ARBoxBreathingPage"));
const MeditationThemePage = lazy(() => import("./pages/MeditationThemePage"));
const MeditationSessionPage = lazy(() => import("./pages/MeditationSessionPage"));
const MeditationRunPage = lazy(() => import("./pages/MeditationRunPage"));
const PlannerPage = lazy(() => import("./pages/PlannerPage"));
const AddAlarmPage = lazy(() => import("./pages/AddAlarmPage"));
const InstallGuidePage = lazy(() => import("./pages/InstallGuidePage"));
const CheckinRebalancePage = lazy(() => import("./pages/CheckinRebalancePage"));
const ResistanceEventPage = lazy(() => import("./pages/ResistanceEventPage"));
const SignalInboxPage = lazy(() => import("./pages/SignalInboxPage"));
const MorningBriefPage = lazy(() => import("./pages/MorningBriefPage"));
const ExecuteBoardPage = lazy(() => import("./pages/ExecuteBoardPage"));
const ChatRoomsPage = lazy(() => import("./pages/ChatRoomsPage"));
const ChatRoomPage = lazy(() => import("./pages/ChatRoomPage"));
const ChatInvitePage = lazy(() =>
  import("./pages/ChatRoomPage").then((module) => ({ default: module.ChatInvitePage }))
);
const DecisionMirrorPage = lazy(() => import("./pages/DecisionMirrorPage"));
const DemoStartPage = lazy(() => import("./pages/DemoStartPage"));
const DemoResultPage = lazy(() => import("./pages/DemoResultPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const SessionAdvicePage = lazy(() => import("./pages/SessionAdvicePage"));
const RecoveryChoicePage = lazy(() => import("./pages/RecoveryChoicePage"));
const MealCoachPage = lazy(() => import("./pages/MealCoachPage"));
const MenstrualModulePage = lazy(() => import("./pages/MenstrualModulePage"));
const MenstrualOutputsPage = lazy(() => import("./pages/MenstrualOutputsPage"));
const OpenChatPage = lazy(() => import("./pages/OpenChatPage"));
const ConditionHubPage = lazy(() => import("./pages/ConditionHubPage"));
const ConditionModulePage = lazy(() => import("./pages/ConditionModulePage"));
const WorkGuideDemoPage = lazy(() => import("./pages/WorkGuideDemoPage"));
const MyPage = lazy(() => import("./pages/MyPage"));

const RouteFallback: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center px-6">
    <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
      Loading page...
    </div>
  </div>
);

const LegacyPlannerRedirect: React.FC<{ tab?: Exclude<PlannerTab, "alarm"> }> = ({
  tab = "today",
}) => {
  const location = useLocation();
  return (
    <Navigate
      to={buildPlannerHref(tab, { baseSearchParams: location.search })}
      replace
      state={location.state}
    />
  );
};

const LegacyAlarmRedirect: React.FC = () => {
  const location = useLocation();
  return (
    <Navigate
      to={buildAddAlarmHref({ baseSearchParams: location.search })}
      replace
      state={location.state}
    />
  );
};

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<RootLanding />} />
        <Route path="/mobile-link" element={<MobileLinkPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/plan/day" element={<LegacyPlannerRedirect tab="today" />} />
        <Route path="/profile-setup" element={<MyPage />} />
        <Route path="/my-page" element={<MyPage />} />
        <Route path="/add-alarm" element={<AddAlarmPage />} />
        <Route path="/planner/alarm" element={<LegacyAlarmRedirect />} />
        <Route path="/deadline-planner" element={<LegacyPlannerRedirect tab="deadline" />} />
        <Route path="/signal-inbox" element={<SignalInboxPage />} />
        <Route path="/morning-brief" element={<MorningBriefPage />} />
        <Route path="/execute-board" element={<ExecuteBoardPage />} />
        <Route path="/checkin" element={<CheckinRebalancePage />} />
        <Route path="/condition" element={<ConditionHubPage />} />
        <Route path="/condition/module/:metricKey" element={<ConditionModulePage />} />
        <Route path="/resistance" element={<ResistanceEventPage />} />
        <Route path="/recover" element={<RecoveryChoicePage />} />
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
        <Route path="/install/android" element={<InstallGuidePage />} />
        <Route path="/install-guide" element={<InstallGuidePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
