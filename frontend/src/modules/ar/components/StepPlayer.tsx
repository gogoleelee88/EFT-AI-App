import { useCallback, useEffect, useState } from 'react';
import type { EFTSessionPlan, EFTStep } from '../types';
import { ttsService } from '../utils/audio';

interface StepPlayerState {
  currentStep: EFTStep | null;
  stepIndex: number;
  timeLeft: number;
  isPlaying: boolean;
  isCountingDown: boolean;
}

export function useStepPlayer(
  plan: EFTSessionPlan,
  autoPlay: boolean = true,
  enableTTS: boolean = true
) {
  const [state, setState] = useState<StepPlayerState>({
    currentStep: plan.steps[0] || null,
    stepIndex: 0,
    timeLeft: plan.steps[0]?.durationSec || 5,
    isPlaying: autoPlay,
    isCountingDown: false
  });

  const goToStep = useCallback((index: number) => {
    const step = plan.steps[index];
    if (!step) return;

    setState(prev => ({
      ...prev,
      currentStep: step,
      stepIndex: index,
      timeLeft: step.durationSec,
      isCountingDown: false
    }));

    // TTS로 안내 읽기
    if (enableTTS && step.tip) {
      setTimeout(() => {
        ttsService.speak(step.tip!);
      }, 500);
    }
  }, [plan.steps, enableTTS]);

  const nextStep = useCallback(() => {
    const nextIndex = Math.min(state.stepIndex + 1, plan.steps.length - 1);
    if (nextIndex !== state.stepIndex) {
      goToStep(nextIndex);
    }
  }, [state.stepIndex, plan.steps.length, goToStep]);

  const prevStep = useCallback(() => {
    const prevIndex = Math.max(state.stepIndex - 1, 0);
    if (prevIndex !== state.stepIndex) {
      goToStep(prevIndex);
    }
  }, [state.stepIndex, goToStep]);

  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const reset = useCallback(() => {
    ttsService.stop();
    goToStep(0);
    setState(prev => ({ ...prev, isPlaying: autoPlay }));
  }, [goToStep, autoPlay]);

  // 타이머 로직
  useEffect(() => {
    if (!state.isPlaying || !state.currentStep) return;

    const timer = setInterval(() => {
      setState(prev => {
        const newTimeLeft = prev.timeLeft - 1;

        // 카운트다운 시작 (마지막 3초)
        if (newTimeLeft <= 3 && newTimeLeft > 0 && !prev.isCountingDown) {
          return { ...prev, timeLeft: newTimeLeft, isCountingDown: true };
        }

        // 스텝 완료, 다음으로 이동
        if (newTimeLeft <= 0) {
          const nextIndex = prev.stepIndex + 1;
          if (nextIndex < plan.steps.length) {
            const nextStep = plan.steps[nextIndex];
            
            // TTS 안내
            if (enableTTS && nextStep.tip) {
              setTimeout(() => {
                ttsService.speak(nextStep.tip!);
              }, 500);
            }

            return {
              ...prev,
              currentStep: nextStep,
              stepIndex: nextIndex,
              timeLeft: nextStep.durationSec,
              isCountingDown: false
            };
          } else {
            // 세션 완료
            return { ...prev, isPlaying: false, timeLeft: 0 };
          }
        }

        return { ...prev, timeLeft: newTimeLeft };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.isPlaying, state.currentStep, plan.steps, enableTTS]);

  return {
    ...state,
    totalSteps: plan.steps.length,
    progress: (state.stepIndex + 1) / plan.steps.length,
    isComplete: state.stepIndex === plan.steps.length - 1 && state.timeLeft <= 0,
    nextStep,
    prevStep,
    goToStep,
    togglePlay,
    reset
  };
}