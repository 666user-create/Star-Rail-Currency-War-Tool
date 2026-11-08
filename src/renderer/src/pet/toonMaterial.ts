import * as THREE from 'three'

/**
 * HSR 风 toon 材质。
 * - 传入 Cool/Warm Ramp（官方 256×16 分层色带）时：直接用真数据做三段乘色曲线，
 *   亮部取 Warm、暗部取 Cool，x=分段光照档位；
 * - 未传 Ramp 时：回退硬编码三段冷暖（1.12/0.86/0.62 + 冷暖 tint）。
 * 边缘光常开；OBJ 重建法线朝内问题在片元里翻转。
 * 贴图保持 NoColorSpace 直通，输出与原图同色域。
 */
export function createHsrToon(
  map: THREE.Texture,
  coolRamp?: THREE.Texture,
  warmRamp?: THREE.Texture
): THREE.ShaderMaterial {
  const hasRamp = coolRamp && warmRamp ? 1 : 0
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: map },
      coolRamp: { value: coolRamp ?? map },
      warmRamp: { value: warmRamp ?? map },
      hasRamp: { value: hasRamp },
      gain: { value: 1.08 },
      mouthOpen: { value: 0 },
      mouthSkinUv: { value: new THREE.Vector2(0.06, 0.90) },
      lightDir: { value: new THREE.Vector3(2, 3.2, 2.4).normalize() }
    },
    vertexShader: `
      varying vec3 vN;
      varying vec2 vUv;
      varying vec3 vV;
      // 局部绑定层保留静止坐标，口型跟随头部而不随骨架变形漂移。
      attribute vec3 petRestPosition;
      attribute float petHeadMask;
      varying vec3 vPetRest;
      varying float vPetHead;
      void main() {
        vPetRest = petRestPosition;
        vPetHead = petHeadMask;
        vN = normalize(normalMatrix * normal);
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D coolRamp;
      uniform sampler2D warmRamp;
      uniform float hasRamp;
      uniform float gain;
      uniform float mouthOpen;
      uniform vec2 mouthSkinUv;
      uniform vec3 lightDir;
      varying vec3 vN;
      varying vec2 vUv;
      varying vec3 vV;
      varying vec3 vPetRest;
      varying float vPetHead;
      void main() {
        vec3 base = texture2D(map, vUv).rgb;
        // 简化嗷呜口型：只替换嘴部的小区域，不复刻眼神、脸颊或原版表情曲线。
        // 皮肤颜色从本机贴图取样，源码不包含贴图/模型数据。范围位于鼻子下方。
        if (mouthOpen > 0.001 && vPetHead > 0.5 && vPetRest.z > 0.78) {
          vec2 lip = vPetRest.xy - vec2(0.0, 0.837);
          float erase = (1.0 - smoothstep(0.88, 1.0,
            length(lip / vec2(0.127, 0.030)))) * smoothstep(0.0, 0.22, mouthOpen);
          base = mix(base, texture2D(map, mouthSkinUv).rgb, erase);
          vec2 q = lip + vec2(0.0, 0.025 * mouthOpen);
          vec2 radius = vec2(0.105 - 0.022 * mouthOpen, 0.004 + 0.075 * mouthOpen);
          float hole = (1.0 - smoothstep(0.90, 1.0, length(q / radius)))
            * smoothstep(0.0, 0.18, mouthOpen);
          vec3 inside = vec3(0.105, 0.028, 0.037);
          float tongue = 1.0 - smoothstep(0.8, 1.0,
            length((q - vec2(0.0, -radius.y * 0.55)) / (radius * vec2(0.69, 0.38))));
          inside = mix(inside, vec3(0.76, 0.29, 0.35), tongue * mouthOpen);
          base = mix(base, inside, hole);
        }
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        // OBJ 重建法线可能朝内：保证法线朝向相机一侧
        if (dot(n, v) < 0.0) n = -n;
        float nl = dot(n, normalize(lightDir));

        // 连续采样版（色带本是平滑渐变）：软明暗界线 + 冷暖混合
        float t = clamp(nl * 0.62 + 0.45, 0.03, 0.97);
        float m = smoothstep(-0.18, 0.30, nl); // 软终止线
        vec3 lit;
        vec3 shd;

        if (hasRamp > 0.5) {
          vec3 warm = texture2D(warmRamp, vec2(t, 0.5)).rgb;
          vec3 cool = texture2D(coolRamp, vec2(t, 0.5)).rgb;
          lit = base * warm;
          shd = base * cool;
        } else {
          lit = base * vec3(1.10, 1.04, 0.94);
          shd = base * vec3(0.74, 0.80, 0.98) * 0.82;
        }

        float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.6) * 0.20;
        vec3 col = mix(shd, lit, m) * gain + vec3(rim);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
}
