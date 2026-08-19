import {
  useEffect,
  useRef,
} from "react";

const DESKTOP_STRENGTH = 0.36;
const DESKTOP_TRAVEL_PX = 108;
const PORTRAIT_STRENGTH = 0.78;
const PORTRAIT_TRAVEL_PX = 198;
const LANDSCAPE_STRENGTH = 0.36;
const LANDSCAPE_TRAVEL_PX = 138;

function getDocumentScrollTop() {
  const scrollingElement =
    document.scrollingElement as HTMLElement | null;

  return Math.max(
    0,
    window.scrollY || 0,
    scrollingElement?.scrollTop ?? 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0,
  );
}

export default function LandingHeroBanner() {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const banner = bannerRef.current;
    const layer = layerRef.current;

    if (!banner || !layer) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const mobileParallax = window.matchMedia(
      "(max-width: 639px), (orientation: landscape) and (max-height: 600px)",
    );
    const mobilePortraitParallax = window.matchMedia(
      "(max-width: 639px) and (orientation: portrait)",
    );

    let framePending = false;
    let animationFrame = 0;

    const updateParallax = () => {
      framePending = false;

      if (reducedMotion.matches) {
        layer.style.setProperty(
          "--hiplingo-hero-parallax-y",
          "0px",
        );
        return;
      }

      let offset = 0;

      if (mobileParallax.matches) {
        offset = mobilePortraitParallax.matches
          ? Math.max(
              0,
              Math.min(
                PORTRAIT_TRAVEL_PX,
                window.scrollY * PORTRAIT_STRENGTH,
              ),
            )
          : Math.max(
              -LANDSCAPE_TRAVEL_PX,
              Math.min(
                0,
                -getDocumentScrollTop() *
                  LANDSCAPE_STRENGTH,
              ),
            );
      } else {
        const rect = banner.getBoundingClientRect();

        if (
          rect.bottom < -80 ||
          rect.top > window.innerHeight + 80
        ) {
          return;
        }

        const viewportCenter = window.innerHeight / 2;
        const elementCenter = rect.top + rect.height / 2;

        offset = Math.max(
          -DESKTOP_TRAVEL_PX,
          Math.min(
            DESKTOP_TRAVEL_PX,
            -(elementCenter - viewportCenter) *
              DESKTOP_STRENGTH,
          ),
        );
      }

      layer.style.setProperty(
        "--hiplingo-hero-parallax-y",
        `${offset.toFixed(2)}px`,
      );
    };

    const requestParallaxUpdate = () => {
      if (framePending) {
        return;
      }

      framePending = true;
      animationFrame =
        window.requestAnimationFrame(updateParallax);
    };

    updateParallax();

    window.addEventListener(
      "scroll",
      requestParallaxUpdate,
      { passive: true },
    );
    /*
     * Mobile landscape can restore site-route scrolling through body/root
     * overflow overrides. WebKit does not consistently report that path via
     * window.scrollY/window "scroll" alone, so also observe captured document
     * scroll events and read the active scrolling element.
     */
    document.addEventListener(
      "scroll",
      requestParallaxUpdate,
      {
        passive: true,
        capture: true,
      },
    );
    window.addEventListener(
      "resize",
      requestParallaxUpdate,
      { passive: true },
    );
    reducedMotion.addEventListener(
      "change",
      requestParallaxUpdate,
    );

    return () => {
      window.removeEventListener(
        "scroll",
        requestParallaxUpdate,
      );
      document.removeEventListener(
        "scroll",
        requestParallaxUpdate,
        true,
      );
      window.removeEventListener(
        "resize",
        requestParallaxUpdate,
      );
      reducedMotion.removeEventListener(
        "change",
        requestParallaxUpdate,
      );
      window.cancelAnimationFrame(animationFrame);
      layer.style.setProperty(
        "--hiplingo-hero-parallax-y",
        "0px",
      );
    };
  }, []);

  return (
    <div
      ref={bannerRef}
      className="hiplingo-hero__banner"
      data-parallax-strength={DESKTOP_STRENGTH}
      aria-hidden="true"
    >
      <div
        ref={layerRef}
        className="hiplingo-hero__parallax-layer"
      />
    </div>
  );
}
