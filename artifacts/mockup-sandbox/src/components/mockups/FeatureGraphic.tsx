import {
  AR_FONT,
  brandBg,
  CREAM,
  Decor,
  GREEN,
  Phone,
  ROSE,
} from "./_store-kit";
import icon from "../../assets/shots/icon.png";
import home from "../../assets/shots/home.jpg";

export default function FeatureGraphic() {
  return (
    <div
      style={{
        width: 1024,
        height: 500,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        direction: "rtl",
        ...brandBg(),
      }}
    >
      <Decor />

      {/* Text block (right side in RTL) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          padding: "0 70px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 26,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              overflow: "hidden",
              boxShadow: "0 14px 30px -8px rgba(0,0,0,0.5)",
              background: CREAM,
              flexShrink: 0,
            }}
          >
            <img
              src={icon}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <span
            style={{
              fontFamily: AR_FONT,
              fontWeight: 900,
              fontSize: 72,
              color: CREAM,
              lineHeight: 1,
            }}
          >
            الطيبات
          </span>
        </div>

        <h1
          style={{
            fontFamily: AR_FONT,
            fontWeight: 900,
            fontSize: 52,
            color: CREAM,
            lineHeight: 1.25,
            margin: 0,
          }}
        >
          متجرك للأكل الصحي
          <br />
          والمؤونة البلدية في الأردن
        </h1>

        <div
          style={{
            marginTop: 28,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            background: ROSE,
            color: "#fff",
            fontFamily: AR_FONT,
            fontWeight: 800,
            fontSize: 28,
            padding: "14px 30px",
            borderRadius: 9999,
            boxShadow: "0 12px 26px -10px rgba(0,0,0,0.5)",
          }}
        >
          كيتو • عضوي • مؤونة • توصيل سريع
        </div>
      </div>

      {/* Phone (left side in RTL) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: 430,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ transform: "translateY(64px) rotate(-6deg)" }}>
          <Phone src={home} width={290} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(270deg, transparent 60%, ${GREEN}22 100%)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
