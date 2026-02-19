/**
 * rPPG (Remote Photoplethysmography) Module
 * Heart rate estimation from video using color changes in facial ROI
 *
 * Based on research: "Remote Photoplethysmography: Evaluation of Contactless Heart Rate Measurement"
 */

/**
 * rPPG confidence calculation
 * Returns confidence score 0-1 based on signal quality
 *
 * @param roi - Region of interest pixel data
 * @param faceQuality - Face detection quality (0-1)
 * @returns Confidence score (0-1)
 */
export function calculateRppgConfidence(
  roi: ImageData | null,
  faceQuality: number
): number {
  if (!roi || faceQuality < 0.3) {
    return 0; // No ROI or poor face detection
  }

  // TODO: Implement full rPPG pipeline
  // 1. Extract RGB channels from ROI
  // 2. Apply spatial averaging
  // 3. Temporal filtering (bandpass 0.7-4 Hz = 42-240 BPM)
  // 4. Calculate signal-to-noise ratio
  // 5. Return confidence based on SNR

  // Placeholder: Base confidence on face quality
  return Math.min(faceQuality * 1.2, 1);
}

/** ImageData에서 녹색 채널 평균 (rPPG 신호에 가장 유리) */
function greenMean(im: ImageData): number {
  const { data } = im;
  let g = 0;
  const n = data.length / 4;
  for (let i = 1; i < data.length; i += 4) g += data[i];
  return g / n;
}

/** 단순 이동평균 제거 (드리프트 제거) */
function detrend(signal: number[], windowMs: number, fps: number): number[] {
  const w = Math.max(1, Math.floor((windowMs / 1000) * fps));
  const out: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(signal.length - 1, i + w); j++) {
      sum += signal[j];
      count += 1;
    }
    out.push(signal[i] - sum / count);
  }
  return out;
}

/** 실수 DFT로 주파수별 크기 (0 ~ N/2) */
function magnitudeSpectrum(signal: number[]): number[] {
  const N = signal.length;
  const half = Math.floor(N / 2) + 1;
  const mag: number[] = [];
  for (let k = 0; k < half; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      re += signal[n] * Math.cos(angle);
      im += signal[n] * Math.sin(angle);
    }
    mag.push(Math.sqrt(re * re + im * im));
  }
  return mag;
}

/**
 * Extract heart rate from video frames using rPPG (Phase 4)
 * Green channel temporal signal → detrend → bandpass(0.7–4 Hz) via FFT → peak → BPM
 *
 * @param frames - Array of recent video frames (ImageData, ROI)
 * @param fps - Effective frame rate (e.g. 10 for 100ms sampling)
 * @returns { hr: number, confidence: number } or null
 */
export function extractHeartRate(
  frames: ImageData[],
  fps: number
): { hr: number; confidence: number } | null {
  const minFrames = Math.ceil(fps * 10); // 10초
  if (frames.length < minFrames) return null;

  const greenSignal = frames.map(greenMean);
  const detrended = detrend(greenSignal, 2000, fps);
  const mag = magnitudeSpectrum(detrended);
  const N = detrended.length;

  // 0.7 Hz = 42 BPM, 4 Hz = 240 BPM. bin k = k * fps / N
  const binLow = Math.max(1, Math.floor((0.7 * N) / fps));
  const binHigh = Math.min(mag.length - 1, Math.ceil((4 * N) / fps));

  let peakBin = binLow;
  let peakVal = mag[binLow];
  for (let k = binLow; k <= binHigh; k++) {
    if (mag[k] > peakVal) {
      peakVal = mag[k];
      peakBin = k;
    }
  }

  const freqHz = (peakBin * fps) / N;
  const bpm = Math.round(freqHz * 60);
  const clampedBpm = Math.max(42, Math.min(240, bpm));

  let snr = 0;
  let sumOther = 0;
  let countOther = 0;
  for (let k = binLow; k <= binHigh; k++) {
    if (k !== peakBin) {
      sumOther += mag[k];
      countOther += 1;
    }
  }
  const meanOther = countOther > 0 ? sumOther / countOther : 0;
  snr = meanOther > 0 ? peakVal / meanOther : 1;
  const confidence = Math.min(1, Math.max(0.2, 0.3 + (snr - 1) * 0.2));

  return { hr: clampedBpm, confidence };
}

/**
 * Calculate HRV (Heart Rate Variability) from rPPG signal
 * Requires high confidence signal (>0.7)
 */
export function calculateHRV(
  rppgSignal: number[],
  confidence: number
): { sdnn: number; rmssd: number } | null {
  if (confidence < 0.7 || rppgSignal.length < 300) {
    return null; // Need high confidence and sufficient data
  }

  // TODO: Implement HRV calculation
  // 1. Detect R-peaks in rPPG signal
  // 2. Calculate RR intervals
  // 3. SDNN (standard deviation of NN intervals)
  // 4. RMSSD (root mean square of successive differences)

  return {
    sdnn: 50, // Placeholder (ms)
    rmssd: 30, // Placeholder (ms)
  };
}

/**
 * Get forehead ROI coordinates from face landmarks
 */
export function getForeheadROI(
  landmarks: any,
  videoWidth: number,
  videoHeight: number
): { x: number; y: number; width: number; height: number } | null {
  if (!landmarks || landmarks.length < 10) return null;

  // MediaPipe face landmark indices:
  // 10: forehead center
  // 151: top of forehead
  // 9: nose bridge (for reference)

  try {
    const foreheadCenter = landmarks[10];
    const foreheadTop = landmarks[151];

    // ROI centered on forehead, 40x40 pixels
    const x = Math.floor(foreheadCenter.x * videoWidth - 20);
    const y = Math.floor(foreheadCenter.y * videoHeight - 20);

    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: 40,
      height: 40,
    };
  } catch (error) {
    console.error("Failed to extract forehead ROI:", error);
    return null;
  }
}

/**
 * Extract ROI pixels from canvas
 */
export function extractROIPixels(
  canvas: HTMLCanvasElement,
  roi: { x: number; y: number; width: number; height: number }
): ImageData | null {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    return ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
  } catch (error) {
    console.error("Failed to extract ROI pixels:", error);
    return null;
  }
}

/**
 * Calculate average RGB values from ImageData
 */
export function averageRGB(imageData: ImageData): { r: number; g: number; b: number } {
  const { data } = imageData;
  let r = 0, g = 0, b = 0;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  return {
    r: r / pixelCount,
    g: g / pixelCount,
    b: b / pixelCount,
  };
}
