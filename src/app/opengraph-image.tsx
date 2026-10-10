import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Share image: LP9 YAYA crest + official YPC logo + club name, on paper.
// Logos are embedded as supplied (no recolouring). Built-in next/og, no deps.

export const alt = "LP9 YPC: Young Professionals Club, RCCG Lagos Province 9";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [crest, ypc] = await Promise.all([
    readFile(join(process.cwd(), "public/branding/lp9-yaya-crest.png"), "base64"),
    readFile(join(process.cwd(), "public/branding/ypc-logo.png"), "base64"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFFDF7",
          padding: "64px 72px",
          borderBottom: "16px solid #FFD400",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${crest}`} width={198} height={240} alt="" />
          <div style={{ width: 2, height: 160, background: "rgba(11,15,44,0.2)" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${ypc}`} width={511} height={180} alt="" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#0B0F2C", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
            LP9 Young Professionals Club
          </div>
          <div style={{ fontSize: 32, color: "#3A3F5E", marginTop: 16 }}>
            RCCG Lagos Province 9 · Jobs, career paths and community
          </div>
        </div>
      </div>
    ),
    size,
  );
}
