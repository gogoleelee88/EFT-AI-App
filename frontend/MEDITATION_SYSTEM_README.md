# 🧘 Tri-Modal Meditation Camera Coaching System

## 📋 Overview

Privacy-first meditation coaching PWA with real-time facial analysis, breathing detection, and intelligent coaching feedback.

## ✅ Implemented Features

### A. FaceMesh Integration
- ✅ MediaPipe FaceLandmarker integration
- ✅ Real-time facial signals extraction:
  - Blink rate (per minute)
  - PERCLOS (eye closure percentage)
  - Head pose (yaw, pitch, roll)
  - Facial tension score
  - Eye openness
  - Signal quality

**Files:**
- `src/signals/face.ts` - FaceMesh analysis engine
- MediaPipe WASM loaded from CDN

### B. Policy Engine + HUD
- ✅ RED/YELLOW/GREEN coaching decision system
- ✅ Smart cooldown management (15-30 seconds)
- ✅ Real-time HUD overlay with:
  - Session timer
  - Coaching messages
  - Breath rate display
  - Tension gauge
  - Eye status indicator
  - Quality meter

**Files:**
- `src/policy/coach.ts` - Coaching policy engine
- `src/components/meditation/HUD.tsx` - HUD overlay component

### C. rPPG + Confidence Gauge
- ✅ rPPG confidence calculation
- ✅ Heart rate auto-hide when confidence < 0.4
- ✅ Signal quality assessment
- ⏳ Full rPPG pipeline (TODO: FFT-based HR extraction)

**Files:**
- `src/signals/rppg.ts` - rPPG analysis (foundation ready)

### D. Session Summary + Weekly Report
- ✅ Session data storage (localStorage, privacy-first)
- ✅ Session summary cards with:
  - Quality score (0-100)
  - Duration, breath rate, tension metrics
  - Coaching event counts
  - Personalized insights
- ✅ Weekly report with:
  - Trend analysis (quality, tension, breath)
  - Progress charts (recharts integration)
  - Total sessions and duration
  - Motivational insights

**Files:**
- `src/services/meditation/sessionStore.ts` - Session storage
- `src/components/meditation/SessionSummary.tsx` - Summary UI
- `src/components/meditation/WeeklyReport.tsx` - Report UI

## 🔐 Contract Signatures (DO NOT CHANGE)

### 1. Media Access
```typescript
requestMediaOnce(): Promise<MediaStream>
```

### 2. Face Signals
```typescript
interface FaceSignals {
  blinkRate: number;
  perclos: number;
  head: { yaw: number; pitch: number; roll: number };
  tension: number;
  eyeOpen: number;
  quality: number;
}
```

### 3. Coaching Decision
```typescript
function decideCoach(
  face: FaceSignals,
  breathsPerMin?: number | null,
  rppgConfidence?: number
): CoachDecision

interface CoachDecision {
  level: "GREEN" | "YELLOW" | "RED";
  actions: CoachAction[];
  cooldownSec: number;
}
```

### 4. Session Storage
```typescript
saveSession(summary: SessionSummary): void
loadSessions(): SessionSummary[]
```

## 🚀 Usage

### Basic Integration

```tsx
import { TriModalMeditation } from '@/components/meditation/TriModalMeditation';

function App() {
  return (
    <TriModalMeditation
      targetDuration={300} // 5 minutes, 0 = infinite
      showMetrics={true}
      onComplete={(summary) => {
        console.log('Session completed:', summary);
      }}
    />
  );
}
```

### Routes

- `/meditation` - Start meditation session
- `/meditation/report` - View weekly report

### Session Summary Callback

```tsx
<TriModalMeditation
  onComplete={(summary) => {
    // summary.qualityScore: 0-100
    // summary.durationSec: session duration
    // summary.avgTension: 0-1
    // summary.avgBreathRate: breaths per minute
    // summary.coachingEvents: array of coaching feedback
  }}
/>
```

## 📊 Data Privacy

### Local-First Storage
- ✅ All processing happens on-device
- ✅ No video/audio uploaded to server
- ✅ Session data stored in localStorage only
- ✅ User can export/delete data anytime

### Storage Management

```typescript
import { clearAllSessions, exportSessions } from '@/services/meditation/sessionStore';

// Export data (GDPR compliance)
const jsonData = exportSessions();

// Delete all data
clearAllSessions();
```

## 🎯 Performance Targets

- ✅ Target: 15-30 FPS on mobile
- ✅ Video resolution: 640×360 (optimal for face detection)
- ✅ MediaPipe GPU acceleration enabled
- ✅ Audio sample rate: 16kHz (sufficient for breath detection)

## 🔧 Technical Stack

- **MediaPipe Tasks Vision** v0.10.15 - Face landmark detection
- **recharts** v2.14.1 - Data visualization
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Web Audio API** - Breathing rate detection
- **Canvas API** - Video frame processing

## 📁 File Structure

```
src/
├── components/
│   └── meditation/
│       ├── TriModalMeditation.tsx    # Main component
│       ├── HUD.tsx                   # Coaching overlay
│       ├── SessionSummary.tsx        # Session results
│       └── WeeklyReport.tsx          # Progress charts
├── policy/
│   └── coach.ts                      # RED/YELLOW/GREEN engine
├── signals/
│   ├── face.ts                       # FaceMesh integration
│   └── rppg.ts                       # Heart rate estimation
└── services/
    └── meditation/
        ├── sessionStore.ts           # Data persistence
        └── mediaAccess.ts            # Camera/mic access
```

## 🚀 Next Steps (Future Enhancements)

1. **Full rPPG Pipeline** - Complete FFT-based heart rate extraction
2. **Breathing Pacer** - Visual breathing guide (4-7-8, box breathing)
3. **Sound Coaching** - Audio feedback option
4. **Multi-language** - i18n support (Korean/English)
5. **Advanced Analytics** - HRV trends, stress scores
6. **Export Reports** - PDF generation for weekly reports

## 🐛 Known Issues & Limitations

1. **rPPG Accuracy**: Current implementation is foundational. Full pipeline requires:
   - FFT implementation for frequency domain analysis
   - Advanced signal filtering (ICA, bandpass)
   - Skin tone adaptation

2. **Breath Detection**: Audio-based detection is basic. Consider:
   - Chest movement detection via pose landmarks
   - Multi-modal fusion (audio + visual)

3. **Browser Compatibility**:
   - HTTPS required for camera/mic access
   - Safari: MediaPipe WASM may need polyfills
   - Firefox: Check getUserMedia constraints

## 📝 Testing Checklist

- [ ] Camera permission flow works on mobile/desktop
- [ ] MediaPipe loads without errors (check console)
- [ ] FaceLandmarker detects face within 2 seconds
- [ ] Coaching messages appear on violations
- [ ] Session summary saves to localStorage
- [ ] Weekly report renders charts correctly
- [ ] No memory leaks after multiple sessions
- [ ] Offline functionality (PWA caching)

## 🎓 References

- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [rPPG Research Paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6426305/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [recharts Documentation](https://recharts.org/)

---

**Generated with Claude Code**
Last updated: 2025-10-29
 