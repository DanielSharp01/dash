import { useEffect, useRef, useState } from "react";

const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] as const;

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

export const canScan = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && isSecureContext;

async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
  if (Native) return new Native({ formats });
  // The ponyfill fetches its zxing wasm from a CDN on first use, so offline scanning
  // on browsers without a native detector needs that file cached or self-hosted.
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: [...formats] });
}

export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const [manual, setManual] = useState("");
  const report = useRef(onCode);
  report.current = onCode;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = stream;
        await video.current!.play();
        const detector = await createDetector();
        const tick = async () => {
          if (stopped) return;
          const found = await detector.detect(video.current!).catch(() => []);
          if (found[0]?.rawValue) {
            navigator.vibrate?.(40);
            report.current(found[0].rawValue);
            return;
          }
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Camera permission was denied." : "Camera is not available.");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      <div className="scanner-frame" aria-hidden />
      <div className="scanner-top">
        <button className="icon-btn on-dark" onClick={onClose} aria-label="Close scanner">
          ✕
        </button>
        <span>Point at a barcode</span>
      </div>
      {error && <p className="scanner-error">{error}</p>}
      <form
        className="scanner-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <input
          inputMode="numeric"
          placeholder="Or type the code"
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
        />
        <button type="submit" disabled={!manual}>
          Use
        </button>
      </form>
    </div>
  );
}
