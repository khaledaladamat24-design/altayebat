import type { CSSProperties, ReactNode } from "react";

export const GREEN = "hsl(152 41% 30%)";
export const GREEN_DEEP = "hsl(152 45% 18%)";
export const GREEN_DARK = "hsl(152 50% 12%)";
export const ROSE = "hsl(349 68% 62%)";
export const CREAM = "hsl(65 33% 98%)";

export const AR_FONT =
  "'Cairo', 'Tajawal', system-ui, sans-serif";

export function brandBg(): CSSProperties {
  return {
    background: `radial-gradient(120% 90% at 80% 0%, ${GREEN} 0%, ${GREEN_DEEP} 45%, ${GREEN_DARK} 100%)`,
  };
}

// Subtle decorative blobs for depth
export function Decor() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "-12%",
          left: "-10%",
          width: "55%",
          height: "40%",
          borderRadius: "9999px",
          background: ROSE,
          opacity: 0.16,
          filter: "blur(90px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-14%",
          right: "-8%",
          width: "55%",
          height: "40%",
          borderRadius: "9999px",
          background: "hsl(152 60% 45%)",
          opacity: 0.22,
          filter: "blur(100px)",
        }}
      />
    </>
  );
}

// iPhone-style device frame wrapping an app screenshot.
export function Phone({
  src,
  width,
  style,
}: {
  src: string;
  width: number;
  style?: CSSProperties;
}) {
  const bezel = Math.round(width * 0.035);
  const radius = Math.round(width * 0.16);
  return (
    <div
      style={{
        width,
        padding: bezel,
        borderRadius: radius,
        background: "linear-gradient(160deg, #1a1a1a, #2b2b2b)",
        boxShadow:
          "0 40px 90px -20px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.06) inset",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: radius - bezel,
          overflow: "hidden",
          background: CREAM,
        }}
      >
        {/* notch */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "34%",
            height: Math.round(width * 0.055),
            background: "#161616",
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 14,
            zIndex: 2,
          }}
        />
        <img
          src={src}
          alt=""
          style={{ width: "100%", display: "block" }}
        />
      </div>
    </div>
  );
}

export function Caption({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center", direction: "rtl", padding: "0 64px" }}>
      <h1
        style={{
          fontFamily: AR_FONT,
          fontWeight: 900,
          color: CREAM,
          fontSize: 74,
          lineHeight: 1.2,
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: AR_FONT,
          fontWeight: 600,
          color: "hsl(65 33% 98% / 0.78)",
          fontSize: 36,
          lineHeight: 1.5,
          marginTop: 22,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

// Full marketing screenshot: branded background, caption, then phone.
export function ShotFrame({
  src,
  title,
  subtitle,
  children,
}: {
  src: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...brandBg(),
      }}
    >
      <Decor />
      <div style={{ position: "relative", marginTop: 96, zIndex: 1 }}>
        <Caption title={title} subtitle={subtitle} />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          marginTop: 70,
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <Phone src={src} width={720} />
      </div>
      {children}
    </div>
  );
}
