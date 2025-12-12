import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import AppHeader from "./AppHeader";

const LayoutController: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const isLandingPage = location.pathname === "/";

  return (
    <>
      {!isLandingPage && isAuthenticated && <AppHeader />}
      {children}
    </>
  );
};

export default LayoutController;
