import React, { createContext, useContext, useState, ReactNode } from 'react';

// EFT Script 타입 정의 (backend의 EFTScript 모델과 일치)
export interface EFTScript {
  setup_phrase: string;
  focus_words: string[];
  target_emotion: string;
  intensity_label: string;
  round_phrases?: string[];
}

interface EFTScriptContextType {
  eftScript: EFTScript | null;
  setEftScript: (script: EFTScript | null) => void;
  clearEftScript: () => void;
}

const EFTScriptContext = createContext<EFTScriptContextType | undefined>(undefined);

export const EFTScriptProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [eftScript, setEftScript] = useState<EFTScript | null>(null);

  const clearEftScript = () => {
    setEftScript(null);
  };

  return (
    <EFTScriptContext.Provider value={{ eftScript, setEftScript, clearEftScript }}>
      {children}
    </EFTScriptContext.Provider>
  );
};

export const useEFTScript = () => {
  const context = useContext(EFTScriptContext);
  if (context === undefined) {
    throw new Error('useEFTScript must be used within an EFTScriptProvider');
  }
  return context;
};
