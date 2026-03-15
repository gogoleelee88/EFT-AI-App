import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { buildAddAlarmHref, buildPlannerHref } from "../../utils/plannerRoutes";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

const LayoutController: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isLandingPage = location.pathname === "/";
  const plannerContextRoutes = new Set([
    "/planner",
    "/add-alarm",
    "/deadline-planner",
    "/plan/day",
  ]);
  const navRoutes = new Set([
    "/signal-inbox",
    "/planner",
    "/add-alarm",
    "/deadline-planner",
    "/plan/day",
    "/my-page",
    "/profile-setup",
  ]);
  const isNavPage = navRoutes.has(location.pathname);

  const getActiveTab = (pathname: string) => {
    if (pathname === "/planner" || pathname === "/deadline-planner" || pathname === "/plan/day") {
      return "planner";
    }
    if (pathname === "/add-alarm") return "addAlarm";
    if (pathname === "/my-page" || pathname === "/profile-setup") return "myPage";
    return "home";
  };

  const onTabChange = (tabId: string) => {
    const baseSearchParams = plannerContextRoutes.has(location.pathname)
      ? location.search
      : undefined;

    if (tabId === "planner") {
      navigate(buildPlannerHref("today", { baseSearchParams }));
      return;
    }

    if (tabId === "addAlarm") {
      navigate(buildAddAlarmHref({ baseSearchParams }));
      return;
    }

    if (tabId === "myPage") {
      navigate("/my-page");
      return;
    }

    navigate("/signal-inbox");
  };

  return (
    <>
      {!isLandingPage && isAuthenticated && <AppHeader />}
      <div className={isNavPage ? "pb-20" : undefined}>{children}</div>
      {isAuthenticated && isNavPage && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
          <BottomNav activeTab={getActiveTab(location.pathname)} onTabChange={onTabChange} />
        </div>
      )}
    </>
  );
};

export default LayoutController;
