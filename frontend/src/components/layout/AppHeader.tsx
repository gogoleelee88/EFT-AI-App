import { Link } from "react-router-dom";
import useInstallPrompt from "../../hooks/useInstallPrompt";

export default function AppHeader() {
  const { supported, promptInstall } = useInstallPrompt();

  return (
    <header className="flex items-center justify-end p-3 border-b bg-white shadow-sm">
      <div className="flex items-center gap-2">
        <Link
          to="/mobile-link"
          className="px-3 py-1 rounded border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
        >
          Link mobile app
        </Link>
        {supported && (
          <button
            onClick={async () => {
              const res = await promptInstall();
              console.log("PWA install outcome:", res?.outcome);
            }}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
          >
            앱 설치
          </button>
        )}
      </div>
    </header>
  );
}
