/**
 * Media Access Service
 * Webcam and microphone access with privacy controls
 *
 * ⚠️ CONTRACT SIGNATURE - DO NOT CHANGE:
 * - requestMediaOnce(): Promise<MediaStream>
 */

let cachedStream: MediaStream | null = null;

/**
 * ⚠️ CONTRACT FUNCTION - SIGNATURE MUST NOT CHANGE
 *
 * Request webcam and microphone access
 * Returns cached stream if already granted
 */
export async function requestMediaOnce(): Promise<MediaStream> {
  // Return cached stream if available
  if (cachedStream && cachedStream.active) {
    console.log("✅ Using cached media stream");
    return cachedStream;
  }

  try {
    console.log("🎥 Requesting camera and microphone access...");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: "user",
        frameRate: { ideal: 30, max: 30 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
      },
    });

    cachedStream = stream;
    console.log("✅ Media access granted");

    return stream;
  } catch (error: any) {
    console.error("❌ Media access denied:", error);

    // Provide user-friendly error messages
    if (error.name === "NotAllowedError") {
      throw new Error(
        "카메라와 마이크 접근이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요."
      );
    } else if (error.name === "NotFoundError") {
      throw new Error(
        "카메라 또는 마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요."
      );
    } else if (error.name === "NotReadableError") {
      throw new Error(
        "카메라가 이미 다른 애플리케이션에서 사용 중입니다."
      );
    } else {
      throw new Error(`미디어 접근 오류: ${error.message}`);
    }
  }
}

/**
 * Stop media stream and release resources
 */
export function stopMediaStream(): void {
  if (cachedStream) {
    cachedStream.getTracks().forEach((track) => {
      track.stop();
      console.log(`🛑 Stopped track: ${track.kind}`);
    });
    cachedStream = null;
    console.log("✅ Media stream released");
  }
}

/**
 * Check if media permissions are granted
 */
export async function checkMediaPermissions(): Promise<{
  camera: PermissionState;
  microphone: PermissionState;
}> {
  try {
    const cameraPermission = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    const micPermission = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });

    return {
      camera: cameraPermission.state,
      microphone: micPermission.state,
    };
  } catch (error) {
    console.warn("Permissions API not supported:", error);
    return {
      camera: "prompt",
      microphone: "prompt",
    };
  }
}

/**
 * Get available media devices
 */
export async function getAvailableDevices(): Promise<{
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
}> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    return {
      cameras: devices.filter((d) => d.kind === "videoinput"),
      microphones: devices.filter((d) => d.kind === "audioinput"),
    };
  } catch (error) {
    console.error("Failed to enumerate devices:", error);
    return { cameras: [], microphones: [] };
  }
}

/**
 * Switch to a different camera
 */
export async function switchCamera(deviceId: string): Promise<MediaStream> {
  // Stop current stream
  stopMediaStream();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false, // Don't change audio device
    });

    cachedStream = stream;
    return stream;
  } catch (error: any) {
    console.error("Failed to switch camera:", error);
    throw new Error(`카메라 전환 실패: ${error.message}`);
  }
}

/**
 * Check if HTTPS is required for media access
 */
export function isSecureContext(): boolean {
  return window.isSecureContext;
}

/**
 * Get media stream constraints info
 */
export function getStreamInfo(stream: MediaStream): {
  video: MediaTrackSettings | null;
  audio: MediaTrackSettings | null;
} {
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  return {
    video: videoTrack ? videoTrack.getSettings() : null,
    audio: audioTrack ? audioTrack.getSettings() : null,
  };
}
