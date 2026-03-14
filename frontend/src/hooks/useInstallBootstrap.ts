import { useEffect, useState } from "react";

import {
  getFallbackInstallBootstrap,
  loadInstallBootstrap,
  type InstallBootstrap,
} from "../utils/installBootstrap";

type InstallBootstrapState = {
  bootstrap: InstallBootstrap;
  loading: boolean;
  warning: string | null;
};

export const useInstallBootstrap = () => {
  const [state, setState] = useState<InstallBootstrapState>(() => ({
    bootstrap: getFallbackInstallBootstrap(),
    loading: true,
    warning: null,
  }));

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await loadInstallBootstrap();
      if (cancelled) return;
      setState({
        bootstrap: next.bootstrap,
        loading: false,
        warning: next.warning,
      });
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
