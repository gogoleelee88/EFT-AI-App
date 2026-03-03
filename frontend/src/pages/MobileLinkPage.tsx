import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "../hooks/useAuth";
import { resolveBackendUrl } from "../config/api";

type PairingCodeResp = {
  code: string;
  expires_at: string;
  qr_payload: string;
};

export default function MobileLinkPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<PairingCodeResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextQuery = encodeURIComponent("/mobile-link");
  const loginPath = `/login?next=${nextQuery}`;

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loading]);

  async function refresh() {
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const url = resolveBackendUrl("/api/pairing/code");
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as PairingCodeResp;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create pairing code");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-4">
        <h1 className="text-xl font-bold">Connect mobile app</h1>
        <p className="mt-2 text-sm opacity-80">Checking login session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto p-4">
        <h1 className="text-xl font-bold">Connect mobile app</h1>
        <p className="text-sm opacity-80 mt-2">Open the app and scan this QR.</p>
        <div className="mt-4 p-3 border rounded bg-white">
          <div className="font-semibold">Login required</div>
          <div className="text-sm mt-1">You need to log in on the web first to create a pairing QR.</div>
        </div>
        <button
          className="mt-4 w-full py-3 rounded bg-black text-white"
          onClick={() => navigate(loginPath)}
        >
          Go to login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-xl font-bold">Connect mobile app</h1>
      <p className="text-sm opacity-80 mt-2">Open the app and scan this QR.</p>

      {error && (
        <div className="mt-4 p-3 border rounded bg-white">
          <div className="font-semibold">Error</div>
          <div className="text-sm mt-1">{error}</div>
        </div>
      )}

      {data && (
        <div className="mt-5 p-4 border rounded bg-white">
          <div className="flex justify-center">
            <QRCodeCanvas value={data.qr_payload} size={220} />
          </div>
          <div className="text-center mt-3">
            <div className="text-3xl font-bold tracking-widest">{data.code}</div>
            <div className="text-xs opacity-70 mt-2">Expires (UTC): {data.expires_at}</div>
          </div>
        </div>
      )}

      <button
        className="mt-4 w-full py-3 rounded bg-black text-white disabled:opacity-60"
        disabled={busy}
        onClick={refresh}
      >
        {busy ? "Generating..." : "Generate new QR"}
      </button>
    </div>
  );
}
