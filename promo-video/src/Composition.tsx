import { Composition } from "remotion";
import { Promo, totalFrames } from "./Promo";
import { PromoVertical } from "./PromoVertical";
import scenes from "./scenes.json";

// 竖版时长和横版一致
const verticalFrames = scenes.reduce((a, s) => a + s.dur * 30, 0);

export const MyComposition = () => {
  return (
    <>
      {/* B站 / 横版 16:9 */}
      <Composition
        id="PromoLandscape"
        component={Promo}
        durationInFrames={totalFrames}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* 抖音 / 竖版 9:16 */}
      <Composition
        id="PromoVertical"
        component={PromoVertical}
        durationInFrames={verticalFrames}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
