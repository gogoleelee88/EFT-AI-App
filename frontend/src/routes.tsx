import React from "react";
import LoginPage from "./pages/LoginPage";
import RootLanding from "./pages/RootLanding";
import Dashboard from "./pages/Dashboard";
import ARDemo from "./pages/ARDemo";
import ARTest from "./pages/ARTest";
import ARHolisticTest from "./pages/ARHolisticTest";
import ArCalibrationPage from "./pages/ArCalibrationPage";
import { EFTStrictPage } from "./pages/EFTStrictPage";
import TriModalMeditation from "./components/meditation/TriModalMeditation";
import ARBoxBreathingPage from "./pages/ARBoxBreathingPage";
import { Routes, Route, Navigate } from "react-router-dom";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootLanding />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/eft-strict" element={<EFTStrictPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/ar-demo" element={<ARDemo />} />
      <Route path="/ar-test" element={<ARTest />} />
      <Route path="/ar-holistic" element={<ARHolisticTest />} />
      <Route path="/ar-box-breathing" element={<ARBoxBreathingPage />} />
      <Route path="/ar-calibration" element={<ArCalibrationPage />} />

      <Route path="/meditation" element={<TriModalMeditation />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
