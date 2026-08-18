import {
  useEffect,
  useRef,
} from "react";

const AMBIENT_BACKGROUND_FPS = 12;
const AMBIENT_FRAME_INTERVAL_MS =
  1000 / AMBIENT_BACKGROUND_FPS;
const AMBIENT_ORBIT_SECONDS = 36;
const RESTING_MOTION_RATE = 0.35;

export default function SiteAmbientBackground() {
  const fieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const field = fieldRef.current;

    if (!field) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let animationFrame = 0;
    let isDocumentVisible =
      document.visibilityState !== "hidden";
    let previousPaintTime = -Infinity;
    let visualClock = 0;
    let previousFrameTime = performance.now();
    let previousTransform = "";

    const paint = (frameTime: number) => {
      const deltaSeconds = Math.max(
        1 / 120,
        Math.min(
          0.1,
          (frameTime - previousFrameTime) / 1000,
        ),
      );
      previousFrameTime = frameTime;
      visualClock += deltaSeconds * RESTING_MOTION_RATE;

      const orbitRadians =
        (visualClock / AMBIENT_ORBIT_SECONDS) *
        Math.PI *
        2;
      const x = Math.cos(orbitRadians) * 2.1;
      const y = Math.sin(orbitRadians) * 1.45;
      const scale =
        1.07 +
        Math.sin(orbitRadians * 0.5) * 0.004;

      const transform =
        `translate3d(${x.toFixed(3)}%, ${y.toFixed(3)}%, 0) ` +
        `scale(${scale.toFixed(4)})`;

      if (transform === previousTransform) {
        return;
      }

      field.style.transform = transform;
      previousTransform = transform;
    };

    const scheduleAnimationFrame = () => {
      if (
        animationFrame ||
        !isDocumentVisible ||
        reducedMotion.matches
      ) {
        return;
      }

      animationFrame =
        window.requestAnimationFrame(animate);
    };

    const animate = (frameTime: number) => {
      animationFrame = 0;

      if (
        !isDocumentVisible ||
        reducedMotion.matches
      ) {
        return;
      }

      if (
        frameTime - previousPaintTime >=
        AMBIENT_FRAME_INTERVAL_MS
      ) {
        paint(frameTime);
        previousPaintTime = frameTime;
      }

      scheduleAnimationFrame();
    };

    const syncMotionPreference = () => {
      if (reducedMotion.matches) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        field.style.transform = "none";
        previousTransform = "none";
        return;
      }

      previousFrameTime = performance.now();
      scheduleAnimationFrame();
    };

    const handleVisibilityChange = () => {
      isDocumentVisible =
        document.visibilityState !== "hidden";

      if (!isDocumentVisible) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        return;
      }

      previousFrameTime = performance.now();
      scheduleAnimationFrame();
    };

    reducedMotion.addEventListener(
      "change",
      syncMotionPreference,
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    if (reducedMotion.matches) {
      field.style.transform = "none";
      previousTransform = "none";
    } else {
      scheduleAnimationFrame();
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      reducedMotion.removeEventListener(
        "change",
        syncMotionPreference,
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      field.style.transform = "";
    };
  }, []);

  return (
    <div
      className="hiplingo-site-ambient-background"
      data-ambient-fps={AMBIENT_BACKGROUND_FPS}
      aria-hidden="true"
    >
      <div
        ref={fieldRef}
        className="hiplingo-site-ambient-background__field"
      />
    </div>
  );
}
