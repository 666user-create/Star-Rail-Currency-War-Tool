import * as THREE from 'three'

/**
 * HSR 风 toon 材质近似：三段冷暖染色 + 边缘光。
 * 目标是"上色饱满"的官方观感（真 Ramp 贴图管线的轻量替代）。
 * 仅用 RGB 底色图；贴图保持 NoColorSpace 直通，输出与原图同色域。
 */
export function createHsrToon(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: map },
      lightDir: { value: new THREE.Vector3(2, 3.2, 2.4).normalize() }
    },
    vertexShader: `
      varying vec3 vN;
      varying vec2 vUv;
      varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 lightDir;
      varying vec3 vN;
      varying vec2 vUv;
      varying vec3 vV;
      void main() {
        vec3 base = texture2D(map, vUv).rgb;
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        // OBJ 重建法线可能朝内：保证法线朝向相机一侧（等效 DoubleSide 翻转）
        if (dot(n, v) < 0.0) n = -n;
        float nl = dot(n, normalize(lightDir));

        // 三段式：亮 1.12 / 中 0.86 / 暗 0.62
        float band = nl > 0.42 ? 1.12 : (nl > 0.0 ? 0.86 : 0.62);
        // 冷暖染色：亮部偏暖、暗部偏冷（替代 Cool/Warm Ramp 的近似）
        vec3 tint = nl > 0.42 ? vec3(1.10, 1.03, 0.92)
                  : (nl > 0.0 ? vec3(1.0) : vec3(0.80, 0.87, 1.06));

        float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.6) * 0.20;        vec3 col = base * band * tint + vec3(rim);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
}
