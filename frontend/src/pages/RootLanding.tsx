import React from "react";
import { Link, useNavigate } from "react-router-dom";
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
      <Link
        to="/demo"
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          zIndex: 30,
          background: "#f59e0b",
          color: "#111827",
          padding: "10px 14px",
          borderRadius: 10,
          fontWeight: 700,
          textDecoration: "none",
          boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
        }}
      >
        Demo Start
      </Link>
      <Link
        to="/meal-coach"
        style={{
          position: "absolute",
          right: 16,
          bottom: 68,
          zIndex: 30,
          background: "#10b981",
          color: "#052e16",
          padding: "10px 14px",
          borderRadius: 10,
          fontWeight: 700,
          textDecoration: "none",
          boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
        }}
      >
        Meal Coach
      </Link>
    </div>
  );
};

export default RootLanding;
