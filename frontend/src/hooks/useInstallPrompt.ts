import { useEffect, useState } from "react";

type PromptChoice = {
  outcome: "accepted" | "dismissed";
  platform?: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<PromptChoice>;
}

export type InstallPromptResult = {
  outcome: "accepted" | "dismissed" | "unavailable" | "error";
};

export default function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferred(promptEvent);
      setSupported(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const promptInstall = async (): Promise<InstallPromptResult> => {
    if (!deferred) {
      return { outcome: "unavailable" };
    }

    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      setSupported(false);
      return { outcome: choice?.outcome ?? "accepted" };
    } catch {
      return { outcome: "error" };
    }
  };

  return { supported, promptInstall };
}
