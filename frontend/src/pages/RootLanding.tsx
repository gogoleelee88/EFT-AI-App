import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const RootLanding: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <iframe
        src="/landing.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        title="Landing Page"
      />
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
