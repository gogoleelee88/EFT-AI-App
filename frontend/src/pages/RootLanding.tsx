import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const RootLanding: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading, logout } = useAuth();

  if (loading) {
    return null;
  }

  const handleAuthClick = async () => {
    if (isAuthenticated) {
      await logout();
      return;
    }
    navigate("/login");
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <iframe
        src="/landing.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        title="Landing Page"
      />
      <button
        type="button"
        onClick={() => void handleAuthClick()}
        style={{
          position: "absolute",
          top: 14,
          right: 16,
          zIndex: 40,
          border: "1px solid #ffffff",
          color: "#ffffff",
          padding: "8px 16px",
          borderRadius: 9999,
          fontWeight: 700,
          fontSize: 14,
          background: "rgba(0, 0, 0, 0.4)",
          cursor: "pointer",
        }}
      >
        {isAuthenticated ? "로그아웃" : "로그인"}
      </button>
    </div>
  );
};

export default RootLanding;
