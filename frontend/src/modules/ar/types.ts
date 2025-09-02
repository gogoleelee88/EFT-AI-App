export type EFTPoint =
  | "brow"        // 눈썹 시작
  | "side_eye"    // 눈 옆
  | "under_eye"   // 눈 밑
  | "under_nose"  // 코 밑
  | "chin"        // 턱
  | "clavicle"    // 쇄골 중앙
  | "under_arm"   // 겨드랑이 아래
  | "top_head";   // 정수리

export type Side = "left" | "right" | "center";

export interface EFTStep {
  point: EFTPoint;
  side: Side;
  durationSec: number;     // 기본 5
  tip?: string;            // 짧은 안내(확언/호흡 지시)
}

export interface EFTSessionPlan {
  title: string;
  introTip?: string;       // 세션 시작 전 안내문 (20자 이내)
  steps: EFTStep[];        // 예: 8~12 스텝
}

export type XY = { 
  x: number; 
  y: number; 
  vis?: number;
};

export type Pose = { 
  landmarks: XY[]; 
};