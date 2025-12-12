import React from "react";
import { RouteObject, Outlet } from "react-router-dom";

import LayoutController from "./components/layout/LayoutController";
import RootLanding from "./pages/RootLanding";

import Dashboard from "./pages/Dashboard";
import ARDemo from "./pages/ARDemo";
import ARTest from "./pages/ARTest";
import ARHolisticTest from "./pages/ARHolisticTest";
import ArCalibrationPage from "./pages/ArCalibrationPage";
import { EFTStrictPage } from "./pages/EFTStrictPage";
import TriModalMeditation from "./components/meditation/TriModalMeditation";
import ARBoxBreathingPage from "./pages/ARBoxBreathingPage";

const Shell = () => (
  <LayoutController>
    <Outlet />
  </LayoutController>
);

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      { path: "/", element: <RootLanding /> },

      { path: "/dashboard", element: <Dashboard /> },
      { path: "/eft-strict", element: <EFTStrictPage /> },

      { path: "/ar-demo", element: <ARDemo /> },
      { path: "/ar-test", element: <ARTest /> },
      { path: "/ar-holistic", element: <ARHolisticTest /> },
      { path: "/ar-box-breathing", element: <ARBoxBreathingPage /> },
      { path: "/ar-calibration", element: <ArCalibrationPage /> },

      { path: "/meditation", element: <TriModalMeditation /> },
    ],
  },
];
