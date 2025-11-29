import useInstallPrompt from "../../hooks/useInstallPrompt";

export default function AppHeader() {
  const { supported, promptInstall } = useInstallPrompt();

  return (
    <header className="flex items-center justify-between p-3 border-b bg-white shadow-sm">
      {/* <h1 className="text-xl font-bold text-gray-800">EFT AI</h1> */}
      {supported && (
        <button
          onClick={async () => {
            const res = await promptInstall(); // 반드시 클릭 핸들러에서!
            console.log("PWA install outcome:", res?.outcome); // accepted | dismissed
          }}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
        >
          앱 설치
        </button>
      )}
    </header>
  );
}