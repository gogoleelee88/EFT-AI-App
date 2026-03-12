import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

const LayoutController: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isLandingPage = location.pathname === "/";
  const navRoutes = new Set(["/signal-inbox", "/add-alarm", "/deadline-planner", "/my-page"]);
  const isNavPage = navRoutes.has(location.pathname);

  const getActiveTab = (pathname: string) => {
    if (pathname === "/add-alarm") return "addAlarm";
    if (pathname === "/deadline-planner") return "addAlarm";
    if (pathname === "/my-page") return "myPage";
    return "home";
  };

  const onTabChange = (tabId: string) => {
    if (tabId === "addAlarm") {
      navigate("/add-alarm");
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
