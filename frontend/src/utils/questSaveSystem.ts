// 성향분석 퀘스트 저장 및 재시작 시스템

export interface SavedQuestData {
  userId: string;
  questId: string;
  startedAt: Date;
  lastSavedAt: Date;
  currentQuestionIndex: number;
  totalQuestions: number;
  responses: Record<string, string>;
  temporaryScores: Record<string, number>;
  achievedMilestones: string[];
  receivedInsights: string[];
  personalityProfile?: {
    communicationStyle: string;
    traits: Record<string, number>;
  };
}

export interface SavePoint {
  questionIndex: number;
  timestamp: Date;
  progressPercentage: number;
}

export class QuestSaveSystem {
  private readonly STORAGE_KEY = 'eft_personality_quest_save';
  private readonly AUTO_SAVE_INTERVAL = 30000; // 30초
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private savePoints: number[] = [25, 50, 75, 100, 125, 150, 175, 200]; // 저장 포인트

  // 자동 저장 시작
  startAutoSave(saveCallback: () => SavedQuestData): void {
    this.stopAutoSave(); // 기존 타이머 정리

    this.autoSaveTimer = setInterval(() => {
      const data = saveCallback();
      this.saveProgress(data);
    }, this.AUTO_SAVE_INTERVAL);
  }

  // 자동 저장 중지
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // 진행 상황 저장
  saveProgress(data: SavedQuestData): boolean {
    try {
      const saveData = {
        ...data,
        lastSavedAt: new Date()
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saveData));
      console.log(`Progress saved at question ${data.currentQuestionIndex}`);
      return true;
    } catch (error) {
      console.error('Failed to save progress:', error);
      return false;
    }
  }

  // 저장된 진행 상황 로드
  loadProgress(): SavedQuestData | null {
    try {
      const savedData = localStorage.getItem(this.STORAGE_KEY);
      if (!savedData) return null;

      const parsed = JSON.parse(savedData);
      
      // 날짜 객체 복원
      return {
        ...parsed,
        startedAt: new Date(parsed.startedAt),
        lastSavedAt: new Date(parsed.lastSavedAt)
      };
    } catch (error) {
      console.error('Failed to load progress:', error);
      return null;
    }
  }

  // 저장된 데이터 존재 여부 확인
  hasSavedProgress(): boolean {
    const savedData = this.loadProgress();
    if (!savedData) return false;

    // 7일 이상 지난 데이터는 무효로 처리
    const daysSinceLastSave = (Date.now() - savedData.lastSavedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSave > 7) {
      this.clearSave();
      return false;
    }

    // 완료된 검사는 저장 데이터로 취급하지 않음
    if (savedData.currentQuestionIndex >= savedData.totalQuestions) {
      this.clearSave();
      return false;
    }

    return true;
  }

  // 저장 포인트인지 확인
  isSavePoint(questionIndex: number): boolean {
    return this.savePoints.includes(questionIndex);
  }

  // 다음 저장 포인트까지 남은 문항 수
  getQuestionsToNextSavePoint(currentIndex: number): number {
    const nextSavePoint = this.savePoints.find(point => point > currentIndex);
    return nextSavePoint ? nextSavePoint - currentIndex : 0;
  }

  // 저장 포인트 정보 반환
  getSavePointInfo(questionIndex: number): { 
    isSavePoint: boolean; 
    nextSavePoint: number; 
    questionsToNext: number; 
  } {
    const isSavePoint = this.isSavePoint(questionIndex);
    const nextSavePoint = this.savePoints.find(point => point > questionIndex) || 200;
    const questionsToNext = nextSavePoint - questionIndex;

    return {
      isSavePoint,
      nextSavePoint,
      questionsToNext
    };
  }

  // 저장 데이터 삭제
  clearSave(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.stopAutoSave();
  }

  // 재시작 옵션 생성
  getResumeOptions(): {
    canResume: boolean;
    progress?: {
      percentage: number;
      questionsCompleted: number;
      totalQuestions: number;
      timeElapsed: string;
      lastSection: string;
    };
  } {
    const savedData = this.loadProgress();
    
    if (!savedData) {
      return { canResume: false };
    }

    const progressPercentage = Math.round((savedData.currentQuestionIndex / savedData.totalQuestions) * 100);
    const timeElapsed = this.formatTimeElapsed(savedData.startedAt, savedData.lastSavedAt);
    const lastSection = this.getCurrentSection(savedData.currentQuestionIndex);

    return {
      canResume: true,
      progress: {
        percentage: progressPercentage,
        questionsCompleted: savedData.currentQuestionIndex,
        totalQuestions: savedData.totalQuestions,
        timeElapsed,
        lastSection
      }
    };
  }

  // 현재 섹션 정보
  private getCurrentSection(questionIndex: number): string {
    if (questionIndex <= 50) return "성격 기본 특성";
    if (questionIndex <= 100) return "감정 및 애착 스타일";  
    if (questionIndex <= 150) return "대인관계 패턴";
    return "가치관 및 회복탄력성";
  }

  // 경과 시간 포맷팅
  private formatTimeElapsed(startTime: Date, endTime: Date): string {
    const diffMs = endTime.getTime() - startTime.getTime();
    const minutes = Math.floor(diffMs / 60000);
    
    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours < 24) {
      return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
    }
    
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  // 저장 상태 메시지 생성
  getSaveStatusMessage(questionIndex: number, lastSaveTime: Date): string {
    const now = new Date();
    const timeDiff = now.getTime() - lastSaveTime.getTime();
    const secondsAgo = Math.floor(timeDiff / 1000);

    if (secondsAgo < 30) return "방금 저장됨";
    if (secondsAgo < 60) return `${secondsAgo}초 전 저장`;
    
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 5) return `${minutesAgo}분 전 저장`;
    
    return lastSaveTime.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    }) + " 저장";
  }

  // 재시작 확인 메시지
  getResumeConfirmMessage(): string {
    const options = this.getResumeOptions();
    if (!options.canResume || !options.progress) return "";

    return `이전에 진행하던 검사가 있습니다.\n\n` +
           `• 진행률: ${options.progress.percentage}%\n` +
           `• 완료 문항: ${options.progress.questionsCompleted}/${options.progress.totalQuestions}\n` +
           `• 마지막 섹션: ${options.progress.lastSection}\n` +
           `• 경과 시간: ${options.progress.timeElapsed}\n\n` +
           `이어서 하시겠습니까?`;
  }

  // 새로 시작 확인 메시지
  getRestartConfirmMessage(): string {
    return "저장된 진행 상황이 삭제되고 처음부터 다시 시작됩니다.\n\n계속하시겠습니까?";
  }
}

// 싱글톤 인스턴스
export const questSaveSystem = new QuestSaveSystem();