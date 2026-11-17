"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[6003], {
4075(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
// src/validate-effect-param.ts
var assertEffectParamsObject = (params, effectLabel) => {
  if (params === null || typeof params !== "object") {
    throw new TypeError(`${effectLabel} effect requires a parameters object, but got ${JSON.stringify(params)}`);
  }
};
var assertRequiredFiniteNumber = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`"${name}" must be a finite number, but got ${JSON.stringify(value)}`);
  }
};
var assertRequiredColor = (value, name) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`"${name}" must be a non-empty string, but got ${JSON.stringify(value)}`);
  }
};
var assertOptionalColor = (value, name) => {
  if (value === undefined) {
    return;
  }
  assertRequiredColor(value, name);
};
var assertOptionalBoolean = (value, name) => {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "boolean") {
    throw new TypeError(`"${name}" must be a boolean, but got ${JSON.stringify(value)}`);
  }
};



__webpack_require__.d(__webpack_exports__, {
}, {
  b3: assertRequiredColor,
  c1: assertRequiredFiniteNumber,
  db: assertEffectParamsObject,
  fX: assertOptionalBoolean,
  gu: assertOptionalColor
});


},
4541(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
// src/webgpu-single-pass-runtime.ts
var WEBGPU_SINGLE_PASS_VERTEX = `
struct VertexOutput {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
}

@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
	let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
	let position = positions[index];
	var output: VertexOutput;
	output.position = vec4f(position, 0, 1);
	output.uv = vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
	return output;
}
`;
var setupWebGpuSinglePass = (target, label) => {
  const context = target.getContext("webgpu");
  if (!context) {
    throw new Error(`WebGPU is not available for the ${label} effect`);
  }
  return { context, label, resources: null };
};
var cleanupWebGpuSinglePass = (state) => {
  state.resources?.source?.texture.destroy();
  state.resources?.uniforms.destroy();
  state.resources?.auxiliary?.texture.destroy();
  state.resources = null;
  state.context.unconfigure();
};
var applyWebGpuSinglePass = ({
  state,
  source,
  device,
  shader,
  uniformData
}, options = null) => {
  const sourceFilter = options?.sourceFilter ?? "linear";
  const auxiliaryTexture = options?.auxiliaryTexture ?? null;
  const width = "displayWidth" in source ? source.displayWidth : ("videoWidth" in source) ? source.videoWidth : ("naturalWidth" in source) ? source.naturalWidth : typeof source.width === "number" ? source.width : source.width.baseVal.value;
  const height = "displayHeight" in source ? source.displayHeight : ("videoHeight" in source) ? source.videoHeight : ("naturalHeight" in source) ? source.naturalHeight : typeof source.height === "number" ? source.height : source.height.baseVal.value;
  const uniformBufferSize = Math.max(16, Math.ceil(uniformData.byteLength / 16) * 16);
  if (state.resources && (state.resources.device !== device || state.resources.shader !== shader || state.resources.uniformBufferSize !== uniformBufferSize || state.resources.sourceFilter !== sourceFilter || (state.resources.auxiliary?.width ?? null) !== (auxiliaryTexture?.width ?? null) || (state.resources.auxiliary?.height ?? null) !== (auxiliaryTexture?.height ?? null) || (state.resources.auxiliary?.format ?? null) !== (auxiliaryTexture?.format ?? null))) {
    cleanupWebGpuSinglePass(state);
  }
  if (!state.resources) {
    const format = navigator.gpu.getPreferredCanvasFormat();
    state.context.configure({ device, format, alphaMode: "premultiplied" });
    const module = device.createShaderModule({
      code: shader,
      label: state.label
    });
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        ...auxiliaryTexture ? [
          {
            binding: 3,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {
              sampleType: auxiliaryTexture.format === "rgba32float" ? "unfilterable-float" : "float"
            }
          }
        ] : [],
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }
      ]
    });
    const pipeline = device.createRenderPipeline({
      label: state.label,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      }),
      vertex: { module, entryPoint: "vertex" },
      fragment: { module, entryPoint: "fragment", targets: [{ format }] },
      primitive: { topology: "triangle-list" }
    });
    const uniforms = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const sampler = device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: sourceFilter,
      minFilter: sourceFilter
    });
    const auxiliary = auxiliaryTexture ? {
      texture: device.createTexture({
        size: [auxiliaryTexture.width, auxiliaryTexture.height],
        format: auxiliaryTexture.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      }),
      width: auxiliaryTexture.width,
      height: auxiliaryTexture.height,
      format: auxiliaryTexture.format,
      uploadedData: null
    } : null;
    state.resources = {
      device,
      shader,
      uniformBufferSize,
      sourceFilter,
      auxiliary,
      pipeline,
      uniforms,
      sampler,
      bindGroupLayout,
      source: null
    };
  }
  const { resources } = state;
  if (resources.source && (resources.source.width !== width || resources.source.height !== height)) {
    resources.source.texture.destroy();
    resources.source = null;
  }
  if (!resources.source) {
    const texture = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    const bindGroup = device.createBindGroup({
      layout: resources.bindGroupLayout,
      entries: [
        ...resources.auxiliary ? [{ binding: 3, resource: resources.auxiliary.texture.createView() }] : [],
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: resources.sampler },
        { binding: 2, resource: { buffer: resources.uniforms } }
      ]
    });
    resources.source = { texture, bindGroup, width, height };
  }
  if (auxiliaryTexture && resources.auxiliary && resources.auxiliary.uploadedData !== auxiliaryTexture.data) {
    device.queue.writeTexture({ texture: resources.auxiliary.texture }, auxiliaryTexture.data, {
      bytesPerRow: auxiliaryTexture.width * 4 * auxiliaryTexture.data.BYTES_PER_ELEMENT
    }, [auxiliaryTexture.width, auxiliaryTexture.height]);
    resources.auxiliary.uploadedData = auxiliaryTexture.data;
  }
  device.queue.copyExternalImageToTexture({ source }, { texture: resources.source.texture, premultipliedAlpha: true }, [width, height]);
  device.queue.writeBuffer(resources.uniforms, 0, uniformData);
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: state.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store"
      }
    ]
  });
  pass.setPipeline(resources.pipeline);
  pass.setBindGroup(0, resources.source.bindGroup);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
};



__webpack_require__.d(__webpack_exports__, {
}, {
  DS: setupWebGpuSinglePass,
  Gl: cleanupWebGpuSinglePass,
  UI: applyWebGpuSinglePass,
  fH: WEBGPU_SINGLE_PASS_VERTEX
});


},
8197(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
/* import */ var _index_4fvp93ps_mjs__rspack_import_0 = __webpack_require__(4075);


// src/color-utils.ts
var DEFAULT_AMOUNT = 1;
var DEFAULT_BRIGHTNESS_AMOUNT = 0;
var DEFAULT_HUE_DEGREES = 0;
var colorAmountSchema = {
  type: "number",
  min: 0,
  max: 1,
  step: 0.01,
  default: DEFAULT_AMOUNT,
  description: "Amount",
  hiddenFromList: false
};
var colorMultiplierSchema = {
  type: "number",
  min: 0,
  step: 0.01,
  default: DEFAULT_AMOUNT,
  description: "Amount",
  hiddenFromList: false
};
var brightnessAmountSchema = {
  type: "number",
  min: -1,
  max: 1,
  step: 0.01,
  default: DEFAULT_BRIGHTNESS_AMOUNT,
  description: "Amount",
  hiddenFromList: false
};
var hueDegreesSchema = {
  type: "rotation-degrees",
  step: 1,
  default: DEFAULT_HUE_DEGREES,
  description: "Degrees"
};
var assertOptionalFiniteNumber = (value, name) => {
  if (value === undefined) {
    return;
  }
  (0,_index_4fvp93ps_mjs__rspack_import_0/* .assertRequiredFiniteNumber */.c1)(value, name);
};
var validateUnitInterval = (value, name) => {
  if (value < 0) {
    throw new TypeError(`"${name}" must be >= 0, but got ${JSON.stringify(value)}`);
  }
  if (value > 1) {
    throw new TypeError(`"${name}" must be <= 1, but got ${JSON.stringify(value)}`);
  }
};
var validateNonNegative = (value, name) => {
  if (value < 0) {
    throw new TypeError(`"${name}" must be >= 0, but got ${JSON.stringify(value)}`);
  }
};
var validateSignedUnitInterval = (value, name) => {
  if (value < -1) {
    throw new TypeError(`"${name}" must be >= -1, but got ${JSON.stringify(value)}`);
  }
  if (value > 1) {
    throw new TypeError(`"${name}" must be <= 1, but got ${JSON.stringify(value)}`);
  }
};
var clampColorChannel = (value) => {
  return Math.max(0, Math.min(255, value));
};
var parseColorRgba = (ctx, color) => {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const { data } = ctx.getImageData(0, 0, 1, 1);
  return [data[0], data[1], data[2], data[3]];
};



__webpack_require__.d(__webpack_exports__, {
}, {
  $j: DEFAULT_BRIGHTNESS_AMOUNT,
  FC: assertOptionalFiniteNumber,
  HQ: colorAmountSchema,
  J: brightnessAmountSchema,
  Oj: clampColorChannel,
  PQ: DEFAULT_AMOUNT,
  XP: validateNonNegative,
  Xb: hueDegreesSchema,
  cz: validateSignedUnitInterval,
  n7: DEFAULT_HUE_DEGREES,
  y0: colorMultiplierSchema,
  yk: validateUnitInterval,
  zp: parseColorRgba
});


},
2014(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_wxhvgv2s_mjs__rspack_import_3 = __webpack_require__(8197);
/* import */ var _index_tvfexb7s_mjs__rspack_import_1 = __webpack_require__(4541);
/* import */ var _index_4fvp93ps_mjs__rspack_import_2 = __webpack_require__(4075);
/* import */ var remotion__rspack_import_0 = __webpack_require__(3947);




// src/shine.ts


// src/shine-webgpu-shader.ts
var SHINE_WEBGPU_SHADER = `
${_index_tvfexb7s_mjs__rspack_import_1/* .WEBGPU_SINGLE_PASS_VERTEX */.fH}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
struct Params {resolution: vec2f, normal: vec2f, band: vec4f, intensity: vec4f,}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
 let color = textureSampleLevel(source, sourceSampler, input.uv, 0);
 let dist = dot(input.uv * params.resolution - params.resolution * 0.5, params.normal) - params.band.x;
 let halo = exp(-(dist*dist)/(params.band.y*params.band.y))*params.band.w;
 let core = exp(-(dist*dist)/(params.band.z*params.band.z))*params.intensity.x;
 let intensity = clamp(halo+core, 0.0, 1.0);
 return vec4f(color.rgb * (1.0-intensity)+vec3f(intensity*color.a), color.a);
}
`;

// src/shine.ts
var { createEffect, createWebGL2ContextError } = remotion__rspack_import_0.Internals;
var DEFAULT_PROGRESS = 0.5;
var DEFAULT_ANGLE = 30;
var DEFAULT_HALO_SIGMA = 200;
var DEFAULT_CORE_SIGMA = 65;
var DEFAULT_HALO_INTENSITY = 0.3;
var DEFAULT_CORE_INTENSITY = 0.4;
var shineSchema = {
  progress: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_PROGRESS,
    description: "Progress",
    hiddenFromList: false
  },
  angle: {
    type: "rotation-degrees",
    step: 1,
    default: DEFAULT_ANGLE,
    description: "Angle"
  },
  haloSigma: {
    type: "number",
    min: 1,
    max: 500,
    step: 1,
    default: DEFAULT_HALO_SIGMA,
    description: "Halo sigma",
    hiddenFromList: false
  },
  coreSigma: {
    type: "number",
    min: 1,
    max: 500,
    step: 1,
    default: DEFAULT_CORE_SIGMA,
    description: "Core sigma",
    hiddenFromList: false
  },
  haloIntensity: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_HALO_INTENSITY,
    description: "Halo intensity",
    hiddenFromList: false
  },
  coreIntensity: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_CORE_INTENSITY,
    description: "Core intensity",
    hiddenFromList: false
  }
};
var resolve = (p) => ({
  progress: p.progress ?? DEFAULT_PROGRESS,
  angle: p.angle ?? DEFAULT_ANGLE,
  haloSigma: p.haloSigma ?? DEFAULT_HALO_SIGMA,
  coreSigma: p.coreSigma ?? DEFAULT_CORE_SIGMA,
  haloIntensity: p.haloIntensity ?? DEFAULT_HALO_INTENSITY,
  coreIntensity: p.coreIntensity ?? DEFAULT_CORE_INTENSITY
});
var validatePositive = (value, name) => {
  if (value <= 0) {
    throw new TypeError(`"${name}" must be greater than 0, but got ${JSON.stringify(value)}`);
  }
};
var validateShineParams = (params) => {
  (0,_index_4fvp93ps_mjs__rspack_import_2/* .assertEffectParamsObject */.db)(params, "Shine");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.progress, "progress");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.angle, "angle");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.haloSigma, "haloSigma");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.coreSigma, "coreSigma");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.haloIntensity, "haloIntensity");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.coreIntensity, "coreIntensity");
  const r = resolve(params);
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateUnitInterval */.yk)(r.progress, "progress");
  validatePositive(r.haloSigma, "haloSigma");
  validatePositive(r.coreSigma, "coreSigma");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateUnitInterval */.yk)(r.haloIntensity, "haloIntensity");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateUnitInterval */.yk)(r.coreIntensity, "coreIntensity");
};
var SHINE_VS = `#version 300 es
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;

void main() {
	vUv = aUv;
	gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
var SHINE_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec2 uBandNormal;
uniform float uBandT;
uniform float uHaloSigma;
uniform float uCoreSigma;
uniform float uHaloIntensity;
uniform float uCoreIntensity;

void main() {
	vec4 source = texture(uSource, vUv);
	vec2 px = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
	vec2 center = uResolution * 0.5;

	float dist = dot(px - center, uBandNormal) - uBandT;
	float halo = exp(-(dist * dist) / (uHaloSigma * uHaloSigma)) * uHaloIntensity;
	float core = exp(-(dist * dist) / (uCoreSigma * uCoreSigma)) * uCoreIntensity;
	float intensity = clamp(halo + core, 0.0, 1.0);

	vec3 finalPremult = source.rgb * (1.0 - intensity) + intensity * source.a;
	fragColor = vec4(finalPremult, source.a);
}
`;
var compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create WebGL shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shine shader compile failed: ${log ?? "(no log)"}`);
  }
  return shader;
};
var linkProgram = (gl, vs, fs) => {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create WebGL program");
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Shine program link failed: ${log ?? "(no log)"}`);
  }
  return program;
};
var shine = createEffect({
  type: "dev.remotion.effects.shine",
  label: "shine()",
  documentationLink: "https://www.remotion.dev/docs/effects/shine",
  calculateKey: (params) => {
    const r = resolve(params);
    return `shine-${r.progress}-${r.angle}-${r.haloSigma}-${r.coreSigma}-${r.haloIntensity}-${r.coreIntensity}`;
  },
  implementations: {
    webgpu: remotion__rspack_import_0.Internals.createEffectImplementation({
      setup: (target) => (0,_index_tvfexb7s_mjs__rspack_import_1/* .setupWebGpuSinglePass */.DS)(target, "shine"),
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice)
          throw new Error("A WebGPU device is required for this effect");
        const r = resolve(params);
        const angle = r.angle * Math.PI / 180;
        const x = Math.cos(angle);
        const y = -Math.sin(angle);
        const range = (Math.abs(x) * width + Math.abs(y) * height) / 2 + 3 * r.haloSigma;
        const bandT = -range + r.progress * range * 2;
        (0,_index_tvfexb7s_mjs__rspack_import_1/* .applyWebGpuSinglePass */.UI)({
          state,
          source,
          width,
          height,
          device: gpuDevice,
          shader: SHINE_WEBGPU_SHADER,
          uniformData: new Float32Array([
            width,
            height,
            x,
            y,
            bandT,
            r.haloSigma,
            r.coreSigma,
            r.haloIntensity,
            r.coreIntensity,
            0,
            0,
            0
          ])
        });
      },
      cleanup: _index_tvfexb7s_mjs__rspack_import_1/* .cleanupWebGpuSinglePass */.Gl
    }),
    webgl2: remotion__rspack_import_0.Internals.createEffectImplementation({
      setup: (target) => {
        const gl = target.getContext("webgl2", {
          premultipliedAlpha: true,
          alpha: true,
          preserveDrawingBuffer: true
        });
        if (!gl) {
          throw createWebGL2ContextError("shine effect");
        }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        const vs = compileShader(gl, gl.VERTEX_SHADER, SHINE_VS);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, SHINE_FS);
        const program = linkProgram(gl, vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        const vao = gl.createVertexArray();
        if (!vao) {
          throw new Error("Failed to create WebGL vertex array");
        }
        gl.bindVertexArray(vao);
        const data = new Float32Array([
          -1,
          -1,
          0,
          0,
          1,
          -1,
          1,
          0,
          -1,
          1,
          0,
          1,
          1,
          1,
          1,
          1
        ]);
        const vbo = gl.createBuffer();
        if (!vbo) {
          throw new Error("Failed to create WebGL buffer");
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(program, "aPos");
        const aUv = gl.getAttribLocation(program, "aUv");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
        gl.bindVertexArray(null);
        const texture = gl.createTexture();
        if (!texture) {
          throw new Error("Failed to create WebGL texture");
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return {
          gl,
          program,
          vao,
          vbo,
          texture,
          uSource: gl.getUniformLocation(program, "uSource"),
          uResolution: gl.getUniformLocation(program, "uResolution"),
          uBandNormal: gl.getUniformLocation(program, "uBandNormal"),
          uBandT: gl.getUniformLocation(program, "uBandT"),
          uHaloSigma: gl.getUniformLocation(program, "uHaloSigma"),
          uCoreSigma: gl.getUniformLocation(program, "uCoreSigma"),
          uHaloIntensity: gl.getUniformLocation(program, "uHaloIntensity"),
          uCoreIntensity: gl.getUniformLocation(program, "uCoreIntensity")
        };
      },
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        const r = resolve(params);
        const angleRad = r.angle * Math.PI / 180;
        const bandNormalX = Math.cos(angleRad);
        const bandNormalY = -Math.sin(angleRad);
        const bboxProjection = Math.abs(bandNormalX) * width + Math.abs(bandNormalY) * height;
        const sweepHalfRange = bboxProjection / 2 + 3 * r.haloSigma;
        const bandT = -sweepHalfRange + r.progress * sweepHalfRange * 2;
        const { gl, program, vao, texture } = state;
        gl.viewport(0, 0, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipSourceY);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.useProgram(program);
        if (state.uSource)
          gl.uniform1i(state.uSource, 0);
        if (state.uResolution)
          gl.uniform2f(state.uResolution, width, height);
        if (state.uBandNormal)
          gl.uniform2f(state.uBandNormal, bandNormalX, bandNormalY);
        if (state.uBandT)
          gl.uniform1f(state.uBandT, bandT);
        if (state.uHaloSigma)
          gl.uniform1f(state.uHaloSigma, r.haloSigma);
        if (state.uCoreSigma)
          gl.uniform1f(state.uCoreSigma, r.coreSigma);
        if (state.uHaloIntensity)
          gl.uniform1f(state.uHaloIntensity, r.haloIntensity);
        if (state.uCoreIntensity)
          gl.uniform1f(state.uCoreIntensity, r.coreIntensity);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);
      },
      cleanup: ({ gl, program, vao, vbo, texture }) => {
        gl.deleteTexture(texture);
        gl.deleteBuffer(vbo);
        gl.deleteProgram(program);
        gl.deleteVertexArray(vao);
      }
    })
  },
  schema: shineSchema,
  validateParams: validateShineParams
});


__webpack_require__.d(__webpack_exports__, {
}, {
  shine: shine
});


},

}]);
//# sourceMappingURL=6003.bundle.js.map