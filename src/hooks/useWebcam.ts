import { useCallback, useEffect, useState } from 'react';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export function useWebcam() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isMirrored, setIsMirrored] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera UVC ${i + 1}`,
        }));
      setDevices(cams);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const stopCamera = useCallback(() => {
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const startCamera = useCallback(
    async (deviceId = '') => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Trình duyệt không hỗ trợ Camera UVC.');
        return;
      }
      setError(null);
      stopCamera();
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        setStream(nextStream);
        const track = nextStream.getVideoTracks()[0];
        const actualId = track?.getSettings().deviceId || deviceId;
        if (actualId) setSelectedDeviceId(actualId);
        await refreshDevices();
      } catch {
        setError('Chưa bật được Camera. Kiểm tra quyền trình duyệt hoặc cáp USB-C.');
      }
    },
    [refreshDevices, stopCamera]
  );

  const toggleCamera = useCallback(() => {
    if (stream) stopCamera();
    else startCamera(selectedDeviceId);
  }, [selectedDeviceId, startCamera, stopCamera, stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  return {
    stream,
    isActive: Boolean(stream),
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isMirrored,
    toggleMirror: () => setIsMirrored((m) => !m),
    startCamera,
    stopCamera,
    toggleCamera,
    error,
  };
}
