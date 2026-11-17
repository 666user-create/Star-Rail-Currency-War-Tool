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

/* ── 统一背景：网格 + 大色斑，给极简画面一点肌理 ── */
const Grid: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: "-10%",
        top: "-20%",
        width: 900,
        height: 900,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(232,196,118,0.10) 0%, rgba(232,196,118,0) 62%)",
      }}
    />
  </AbsoluteFill>
);

/* ── 大字：按字符逐个入场，每行独立控制 ── */
const BigText: React.FC<{
  lines: string[];
  size?: number;
  color?: string;
  align?: "center" | "left";
  delay?: number;
  stagger?: number;
}> = ({ lines, size = 108, color = TEXT, align = "center", delay = 0, stagger = 4 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start" }}>
      {lines.map((line, li) => {
        const chars = [...line];
        return (
          <div
            key={li}
            style={{
              display: "flex",
              fontSize: size,
              fontWeight: 900,
              lineHeight: 1.18,
              letterSpacing: align === "center" ? 2 : 0,
              color,
            }}
          >
            {chars.map((ch, ci) => {
              const start = delay + (li * chars.length + ci) * stagger;
              const o = interpolate(frame - start, [0, 9], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const y = interpolate(frame - start, [0, 12], [26, 0], {
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

/* ── 淡入的一行小字 ── */
const Sub: React.FC<{ text: string; delay?: number; size?: number; color?: string }> = ({
  text,
  delay = 40,
  size = 26,
  color = MUTED,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ fontSize: size, color, opacity: o, marginTop: 30, letterSpacing: 1 }}>{text}</div>;
};

/* ── 桌宠：放大做主角 ── */
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

/* 1｜开场：桌宠 + 品牌名 */
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const sc = spring({ frame, fps, config: { damping: 10, stiffness: 110 } });
  const sub = interpolate(frame, [46, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `scale(${sc})`, marginBottom: 8 }}>
          <Pet size={300} bob />
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, color: GOLD, letterSpacing: 10, marginTop: 10 }}>
          货币战争桌宠
        </div>
        <div style={{ fontSize: 26, color: MUTED, marginTop: 26, opacity: sub, letterSpacing: 3 }}>
          一个玩家自己做的战绩记录工具
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("audio/s1.mp3")} />
    </AbsoluteFill>
  );
};

/* 2｜痛点：大字递进，最后一句高亮 */
const Scene2: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <div
        style={{
          position: "absolute",
          left: 130,
          right: 100,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      >
        <BigText lines={["没有计时"]} size={92} color={MUTED} align="left" delay={6} />
        <div style={{ marginTop: 10 }}>
          <BigText lines={["不知道打了多少把"]} size={92} color={MUTED} align="left" delay={66} />
        </div>
        <div style={{ marginTop: 26 }}>
          <BigText lines={["打完就没了"]} size={132} color={GOLD} align="left" delay={140} />
        </div>
      </div>
      <Audio src={staticFile("audio/s2.mp3")} />
    </AbsoluteFill>
  );
};

/* 3｜转折：所以 / 我做了这个 */
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const sc = spring({ frame: Math.max(0, frame - 42), fps, config: { damping: 11, stiffness: 120 } });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", paddingLeft: 130 }}>
        <BigText lines={["所以我做了"]} size={88} color={MUTED} delay={4} />
        <div style={{ marginTop: 16 }}>
          <BigText lines={["这个"]} size={150} color={GOLD} delay={48} />
        </div>
        <Sub text="一只会说话的奇美拉，挂在屏幕角落" delay={90} size={28} />
      </AbsoluteFill>
      <div style={{ position: "absolute", right: 90, bottom: 40, transform: `scale(${sc})` }}>
        <Pet size={360} bob delay={44} />
      </div>
      <Audio src={staticFile("audio/s3.mp3")} />
    </AbsoluteFill>
  );
};

/* 4｜安装：三步，超大数字 */
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
      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", paddingLeft: 130 }}>
        <BigText lines={["三步装好"]} size={120} color={GOLD} delay={2} />
        <div style={{ display: "flex", gap: 70, marginTop: 56 }}>
          {STEPS.map((s, i) => {
            const d = 60 + i * 34;
            const o = interpolate(frame - d, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={s.n} style={{ opacity: o, transform: `translateY(${(1 - o) * 20}px)` }}>
                <div style={{ fontSize: 62, fontWeight: 900, color: "rgba(232,196,118,0.45)" }}>{s.n}</div>
                <div style={{ fontSize: 27, fontWeight: 700, color: TEXT, marginTop: 6 }}>{s.t}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("audio/s4.mp3")} />
    </AbsoluteFill>
  );
};

/* 5｜记录：计时 → 粘贴 → 入库，配真实截图 */
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const shotO = interpolate(frame - 70, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", paddingLeft: 100, paddingRight: 60 }}>
        <div style={{ flex: 1 }}>
          <BigText lines={["计时", "粘贴"]} size={96} color={TEXT} align="left" delay={4} />
          <div style={{ marginTop: 8 }}>
            <BigText lines={["入库"]} size={96} color={GOLD} align="left" delay={50} />
          </div>
          <Sub text="打完粘贴结算图，自动识别填好" delay={100} size={24} />
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", opacity: shotO }}>
          <Img
            src={staticFile("shots/tab-lineup-tight.png")}
            style={{
              width: 620,
              borderRadius: 12,
              border: `1px solid ${GOLD_DIM}`,
              boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
              transform: `translateY(${(1 - shotO) * 30}px)`,
            }}
          />
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("audio/s5.mp3")} />
    </AbsoluteFill>
  );
};

/* 6｜满级：一张真实满级卡做主角 + 侧边大字 */
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [20, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", paddingLeft: 100, paddingRight: 80 }}>
        <div style={{ flex: 1 }}>
          <BigText lines={["A6", "→", "A8·20"]} size={104} color={GOLD} align="left" delay={4} stagger={6} />
          <Sub text="新赛季两天，A6·1 一路打到满级" delay={90} size={23} />
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", opacity: o }}>
          <Img
            src={staticFile("shots/tab-rank-crop.png")}
            style={{
              width: 600,
              borderRadius: 12,
              border: `1px solid ${GOLD_DIM}`,
              boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
              transform: `translateX(${(1 - o) * 40}px)`,
            }}
          />
        </div>
      </AbsoluteFill>
      <Audio src={staticFile("audio/s6.mp3")} />
    </AbsoluteFill>
  );
};

/* 7｜数据：三个短语 */
const Scene7: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", paddingLeft: 130 }}>
        <BigText lines={["导出 · 备份 · 多存档"]} size={92} color={TEXT} delay={2} stagger={3} />
        <Sub text="数据都在你自己手里" delay={80} />
      </AbsoluteFill>
      <Audio src={staticFile("audio/s7.mp3")} />
    </AbsoluteFill>
  );
};

/* 8｜收尾：桌宠 + 下载 + 祝福 */
const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const sc = spring({ frame: Math.max(0, frame - 2), fps, config: { damping: 10, stiffness: 120 } });
  const tip = interpolate(frame, [56, 82], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Grid />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `scale(${sc})` }}>
          <Pet size={230} bob />
        </div>
        <div style={{ fontSize: 88, fontWeight: 900, color: GOLD, letterSpacing: 8, marginTop: 6 }}>
          货币战争桌宠
        </div>
        <div style={{ fontSize: 30, color: TEXT, marginTop: 26, opacity: tip, letterSpacing: 2 }}>
          评论区 · 主页链接下载
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: GOLD, marginTop: 26, opacity: tip, letterSpacing: 3 }}>
          祝大家把把三星五费
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

export const Promo: React.FC = () => {
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
