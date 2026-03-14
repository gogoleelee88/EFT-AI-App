import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { buildPlannerHref } from "../../utils/plannerRoutes";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

const LayoutController: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isLandingPage = location.pathname === "/";
  const navRoutes = new Set([
    "/signal-inbox",
    "/planner",
    "/add-alarm",
    "/deadline-planner",
    "/plan/day",
    "/my-page",
  ]);
  const isNavPage = navRoutes.has(location.pathname);

  const getActiveTab = (pathname: string) => {
    if (pathname === "/planner") return "addAlarm";
    if (pathname === "/add-alarm") return "addAlarm";
    if (pathname === "/deadline-planner") return "addAlarm";
    if (pathname === "/plan/day") return "addAlarm";
    if (pathname === "/my-page") return "myPage";
    return "home";
  };

  const onTabChange = (tabId: string) => {
    if (tabId === "addAlarm") {
      navigate(
        buildPlannerHref("alarm", {
          baseSearchParams: location.pathname === "/planner" ? location.search : undefined,
        })
      );
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
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav activeTab={getActiveTab(location.pathname)} onTabChange={onTabChange} />
        </div>
      )}
    </>
  );
};

export default LayoutController;
