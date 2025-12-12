import React from "react";

const RootLanding: React.FC = () => {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <iframe
        src="/landing.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        title="Landing Page"
      />
    </div>
  );
};

export default RootLanding;
