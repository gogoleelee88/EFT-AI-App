import React, { useState } from "react";
import { Calibration, ARSession } from "../modules/ar";
import plan from "../modules/ar/sample-plan.json";

export default function ArCalibrationPage(){
  const [ready, setReady] = useState(false);
  return ready ? (
    <ARSession plan={plan} />
  ) : (
    <Calibration onReady={()=> setReady(true)} message={plan.introTip || "초록 박스에 상반신을 맞춰주세요"} />
  );
}