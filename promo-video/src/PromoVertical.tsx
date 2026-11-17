import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import scenes from "./scenes.json";

const GOLD = "#e8c476";
const GOLD_DIM = "rgba(232,196,118,0.45)";
const BG = "#0b0f1e";
const TEXT = "#f2f0f6";
const MUTED = "#7a7f99";

const fps = 30;

const startFrames: Record<string, number> = {};
let acc = 0;
for (const s of scenes) {
  startFrames[s.id] = acc;
  acc += s.dur * fps;
}
export const totalFrames = acc;

const Grid: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "72px 72px",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: "-20%",
        top: "10%",
        width: 1100,
        height: 1100,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(232,196,118,0.11) 0%, rgba(232,196,118,0) 62%)",
      }}
    />
  </AbsoluteFill>
);

/** 竖版大字：字号更大，逐字入场 */
const BigText: React.FC<{
  lines: string[];
  size?: number;
  color?: string;
  delay?: number;
  stagger?: number;
  gap?: number;
}> = ({ lines, size = 120, color = TEXT, delay = 0, stagger = 4, gap = 18 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap }}>
      {lines.map((line, li) => {
        const chars = [...line];
        return (
          <div
            key={li}
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: size,
              fontWeight: 900,
              lineHeight: 1.16,
              color,
            }}
          >
            {chars.map((ch, ci) => {
              const start = delay + (li * chars.length + ci) * stagger;
              const o = interpolate(frame - start, [0, 9], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const y = interpolate(frame - start, [0, 12], [30, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <span key={ci} style={{ opacity: o, transform: `translateY(${y}px)`, display: "inline-block" }}>
                  {ch}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const Sub: React.FC<{ text: string; delay?: number; size?: number }> = ({ text, delay = 40, size = 30 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ fontSize: size, color: MUTED, opacity: o, marginTop: 34, lineHeight: 1.5 }}>{text}</div>;
};

const Pet: React.FC<{ size: number; bob?: boolean; delay?: number }> = ({ size, bob = false, delay = 0 }) => {
  const frame = useCurrentFrame();
  const bobY = bob ? Math.sin(frame / 14) * 8 : 0;
  const sc = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 11, stiffness: 120 } });
  return (
    <img
      src={staticFile("assets/pet.png")}
      style={{
        width: size,
        height: "auto",
        transform: `translateY(${bobY}px) scale(${sc})`,
        filter: "drop-shadow(0 24px 50px rgba(0,0,0,0.65))",
      }}
    />
  );
};

/* 1 开场 */
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const sc = spring({ frame, fps, config: { damping: 10, stiffness: 110 } });
  const sub = interpolate(frame, [46, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ transform: `scale(${sc})` }}>
          <Pet size={400} bob />
        </div>
        <div style={{ fontSize: 130, fontWeight: 900, color: GOLD, marginTop: 20, letterSpacing: 8, textAlign: "center" }}>
          货币战争
        </div>
        <div style={{ fontSize: 130, fontWeight: 900, color: GOLD, letterSpacing: 8 }}>桌宠</div>
        <div style={{ fontSize: 30, color: MUTED, marginTop: 34, opacity: sub, textAlign: "center" }}>
          一个玩家自己做的
          <br />
          战绩记录工具
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("audio/s1.mp3")} />
    </AbsoluteFill>
  );
};

/* 2 痛点 */
const Scene2: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <div style={{ position: "absolute", left: 100, right: 80, top: "50%", transform: "translateY(-50%)" }}>
        <BigText lines={["没有计时"]} size={116} color={MUTED} delay={6} />
        <div style={{ marginTop: 22 }}>
          <BigText lines={["不知道打了", "多少把"]} size={116} color={MUTED} delay={66} />
        </div>
        <div style={{ marginTop: 40 }}>
          <BigText lines={["打完就", "没了"]} size={168} color={GOLD} delay={150} />
        </div>
      </div>
      <Audio src={staticFile("audio/s2.mp3")} />
    </AbsoluteFill>
  );
};

/* 3 转折 */
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const sc = spring({ frame: Math.max(0, frame - 40), fps, config: { damping: 11, stiffness: 120 } });
  return (
    <AbsoluteFill>
      <Grid />
      <div style={{ position: "absolute", left: 100, right: 80, top: "14%" }}>
        <BigText lines={["所以我做了"]} size={92} color={MUTED} delay={4} />
        <div style={{ marginTop: 14 }}>
          <BigText lines={["这个"]} size={190} color={GOLD} delay={48} />
        </div>
        <Sub text="一只会说话的奇美拉" delay={90} size={34} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 60, display: "flex", justifyContent: "center", transform: `scale(${sc})` }}>
        <Pet size={480} bob delay={44} />
      </div>
      <Audio src={staticFile("audio/s3.mp3")} />
    </AbsoluteFill>
  );
};

/* 4 安装 */
const STEPS = [
  { n: "01", t: "自动找到游戏" },
  { n: "02", t: "选好截图位置" },
  { n: "03", t: "解包随宠模型" },
];
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Grid />
      <div style={{ position: "absolute", left: 100, right: 80, top: "50%", transform: "translateY(-50%)" }}>
        <BigText lines={["三步装好"]} size={150} color={GOLD} delay={2} />
        <div style={{ display: "flex", flexDirection: "column", gap: 44, marginTop: 70 }}>
          {STEPS.map((s, i) => {
            const d = 60 + i * 30;
            const o = interpolate(frame - d, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 32, opacity: o, transform: `translateX(${(1 - o) * 30}px)` }}>
                <div style={{ fontSize: 76, fontWeight: 900, color: "rgba(232,196,118,0.42)", minWidth: 110 }}>{s.n}</div>
                <div style={{ fontSize: 44, fontWeight: 700, color: TEXT }}>{s.t}</div>
              </div>
            );
          })}
        </div>
      </div>
      <Audio src={staticFile("audio/s4.mp3")} />
    </AbsoluteFill>
  );
};

/* 5 记录 + 真实截图 */
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - 66, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      {/* 整体垂直居中铺满，避免中间大片空白 */}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 46 }}>
        <div style={{ width: "100%", paddingLeft: 100, paddingRight: 80 }}>
          <BigText lines={["计时 · 粘贴"]} size={92} color={TEXT} delay={4} />
          <div style={{ marginTop: 12 }}>
            <BigText lines={["入库"]} size={132} color={GOLD} delay={54} />
          </div>
        </div>
        <Img
          src={staticFile("shots/tab-lineup-tight.png")}
          style={{
            width: 940,
            borderRadius: 14,
            border: `1px solid ${GOLD_DIM}`,
            boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
            opacity: o,
            transform: `translateY(${(1 - o) * 40}px)`,
          }}
        />
      </AbsoluteFill>
      <Audio src={staticFile("audio/s5.mp3")} />
    </AbsoluteFill>
  );
};

/* 6 满级 + 真实贺卡 */
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [16, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
        <div style={{ width: "100%", paddingLeft: 100, paddingRight: 80 }}>
          <BigText lines={["A6 → A8·20"]} size={104} color={GOLD} delay={4} stagger={5} />
          <Sub text="新赛季两天，A6·1 一路打到满级" delay={70} size={28} />
        </div>
        <Img
          src={staticFile("shots/tab-rank-crop.png")}
          style={{
            width: 880,
            borderRadius: 14,
            border: `1px solid ${GOLD_DIM}`,
            boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
            opacity: o,
            transform: `translateY(${(1 - o) * 40}px)`,
          }}
        />
      </AbsoluteFill>
      <Audio src={staticFile("audio/s6.mp3")} />
    </AbsoluteFill>
  );
};

/* 7 数据 */
const Scene7: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <div style={{ position: "absolute", left: 100, right: 80, top: "50%", transform: "translateY(-50%)" }}>
        <BigText lines={["导出"]} size={128} color={TEXT} delay={2} />
        <div style={{ marginTop: 14 }}>
          <BigText lines={["备份"]} size={128} color={TEXT} delay={44} />
        </div>
        <div style={{ marginTop: 14 }}>
          <BigText lines={["多存档"]} size={128} color={GOLD} delay={86} />
        </div>
        <Sub text="数据都在你自己手里" delay={130} size={32} />
      </div>
      <Audio src={staticFile("audio/s7.mp3")} />
    </AbsoluteFill>
  );
};

/* 8 收尾 */
const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const sc = spring({ frame: Math.max(0, frame - 2), fps, config: { damping: 10, stiffness: 120 } });
  const tip = interpolate(frame, [54, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ transform: `scale(${sc})` }}>
          <Pet size={330} bob />
        </div>
        <div style={{ fontSize: 104, fontWeight: 900, color: GOLD, marginTop: 16, letterSpacing: 6, textAlign: "center" }}>
          货币战争桌宠
        </div>
        <div style={{ fontSize: 34, color: TEXT, marginTop: 34, opacity: tip, textAlign: "center", lineHeight: 1.6 }}>
          评论区 · 主页链接下载
        </div>
        <div style={{ fontSize: 52, fontWeight: 900, color: GOLD, marginTop: 30, opacity: tip, textAlign: "center" }}>
          祝大家把把
          <br />
          三星五费
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("audio/s8.mp3")} />
    </AbsoluteFill>
  );
};

const SCENE_MAP: Record<string, React.FC> = {
  s1: Scene1,
  s2: Scene2,
  s3: Scene3,
  s4: Scene4,
  s5: Scene5,
  s6: Scene6,
  s7: Scene7,
  s8: Scene8,
};

export const PromoVertical: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ width, height, background: BG }}>
      {scenes.map((s) => {
        const Scene = SCENE_MAP[s.id];
        if (!Scene) return null;
        return (
          <Sequence key={s.id} from={startFrames[s.id]} durationInFrames={s.dur * fps}>
            <AbsoluteFill>
              <Scene />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
