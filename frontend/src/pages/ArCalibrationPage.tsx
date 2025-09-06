import { useState } from "react";
import { Calibration, ARSession } from "../modules/ar";
import planData from "../modules/ar/sample-plan.json";
import type { EFTSessionPlan } from "../modules/ar/types";

export default function ArCalibrationPage(){
  const [ready, setReady] = useState(false);
  const plan = planData as EFTSessionPlan;
  
  return ready ? (
    <ARSession plan={plan} />
  ) : (
    <Calibration onReady={()=> setReady(true)} message={plan.introTip || "초록 박스에 상반신을 맞춰주세요"} />
  );
}