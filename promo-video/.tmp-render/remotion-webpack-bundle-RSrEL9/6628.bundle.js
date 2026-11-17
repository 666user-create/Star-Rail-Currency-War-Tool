"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[6628], {
2199(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
/* import */ var _index_tvfexb7s_mjs__rspack_import_1 = __webpack_require__(4541);
/* import */ var remotion__rspack_import_0 = __webpack_require__(3947);


// src/progressive-pixelate-runtime.ts

var { createWebGL2ContextError } = remotion__rspack_import_0.Internals;
var VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;

void main() {
	vUv = aUv;
	gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
var FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform int uMode;
uniform vec2 uStart;
uniform vec2 uEnd;
uniform vec2 uCenter;
uniform float uWidth;
uniform float uHeight;
uniform float uRotation;
uniform float uRadialStart;
uniform float uStartBlockSize;
uniform float uEndBlockSize;

float linearProgress(vec2 uv) {
	vec2 gradient = uEnd - uStart;
	float gradientLengthSq = dot(gradient, gradient);
	if (gradientLengthSq <= 0.0000001) {
		return 0.0;
	}

	return clamp(dot(uv - uStart, gradient) / gradientLengthSq, 0.0, 1.0);
}

float radialProgress(vec2 uv) {
	vec2 radii = vec2(uWidth * uResolution.x, uHeight * uResolution.y) * 0.5;
	if (radii.x <= 0.0000001 || radii.y <= 0.0000001) {
		return 0.0;
	}

	vec2 delta = (uv - uCenter) * uResolution;
	float angle = radians(uRotation);
	float c = cos(angle);
	float s = sin(angle);
	vec2 local = vec2(
		c * delta.x + s * delta.y,
		-s * delta.x + c * delta.y
	);
	float ellipseProgress = clamp(length(local / radii), 0.0, 1.0);
	float distance = 1.0 - uRadialStart;
	return abs(distance) <= 0.0000001
		? step(uRadialStart, ellipseProgress)
		: clamp((ellipseProgress - uRadialStart) / distance, 0.0, 1.0);
}

vec4 samplePixelated(float blockSize) {
	vec2 pixelSizeUv = vec2(blockSize) / uResolution;
	vec2 blockUv = floor(vUv / pixelSizeUv) * pixelSizeUv + pixelSizeUv * 0.5;
	return texture(uSource, blockUv);
}

void main() {
	// Public UV coordinates use top-left origin, matching canvas/CSS coordinates.
	vec2 publicUv = vec2(vUv.x, 1.0 - vUv.y);
	float progress = uMode == 0
		? linearProgress(publicUv)
		: radialProgress(publicUv);
	float targetBlockSize = max(
		1.0,
		mix(uStartBlockSize, uEndBlockSize, progress)
	);

	// Adjacent power-of-two grids remain aligned as the block size changes.
	float level = log2(targetBlockSize);
	float lowerBlockSize = exp2(floor(level));
	float upperBlockSize = lowerBlockSize * 2.0;
	float levelProgress = fract(level);
	fragColor = mix(
		samplePixelated(lowerBlockSize),
		samplePixelated(upperBlockSize),
		levelProgress
	);
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
    throw new Error(`Progressive pixelate shader compile failed: ${log ?? "(no log)"}`);
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
    throw new Error(`Progressive pixelate program link failed: ${log ?? "(no log)"}`);
  }
  return program;
};
var setupProgressivePixelate = (target) => {
  const gl = target.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  if (!gl) {
    throw createWebGL2ContextError("progressive pixelate effect");
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
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
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
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
    uniforms: {
      uSource: gl.getUniformLocation(program, "uSource"),
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uMode: gl.getUniformLocation(program, "uMode"),
      uStart: gl.getUniformLocation(program, "uStart"),
      uEnd: gl.getUniformLocation(program, "uEnd"),
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uWidth: gl.getUniformLocation(program, "uWidth"),
      uHeight: gl.getUniformLocation(program, "uHeight"),
      uRotation: gl.getUniformLocation(program, "uRotation"),
      uRadialStart: gl.getUniformLocation(program, "uRadialStart"),
      uStartBlockSize: gl.getUniformLocation(program, "uStartBlockSize"),
      uEndBlockSize: gl.getUniformLocation(program, "uEndBlockSize")
    }
  };
};
var prepareProgressivePixelate = ({
  state,
  source,
  width,
  height,
  flipSourceY
}) => {
  const { gl, uniforms } = state;
  gl.viewport(0, 0, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipSourceY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.useProgram(state.program);
  if (uniforms.uSource)
    gl.uniform1i(uniforms.uSource, 0);
  if (uniforms.uResolution)
    gl.uniform2f(uniforms.uResolution, width, height);
};
var drawProgressivePixelate = (state) => {
  const { gl } = state;
  gl.bindVertexArray(state.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.useProgram(null);
};
var cleanupProgressivePixelate = ({
  gl,
  program,
  vao,
  vbo,
  texture
}) => {
  gl.deleteTexture(texture);
  gl.deleteBuffer(vbo);
  gl.deleteProgram(program);
  gl.deleteVertexArray(vao);
};
var PROGRESSIVE_PIXELATE_WEBGPU_SHADER = `
${_index_tvfexb7s_mjs__rspack_import_1/* .WEBGPU_SINGLE_PASS_VERTEX */.fH}
struct Params {
 resolutionModeBlock: vec4f,
 startEnd: vec4f,
 centerSize: vec4f,
 controls: vec4f,
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
fn linearProgress(uv: vec2f) -> f32 {
 let gradient = params.startEnd.zw - params.startEnd.xy;
 let gradientLengthSq = dot(gradient, gradient);
 if (gradientLengthSq <= 0.0000001) { return 0.0; }
 return clamp(dot(uv - params.startEnd.xy, gradient) / gradientLengthSq, 0.0, 1.0);
}
fn radialProgress(uv: vec2f) -> f32 {
 let radii = params.centerSize.zw * params.resolutionModeBlock.xy * 0.5;
 if (radii.x <= 0.0000001 || radii.y <= 0.0000001) { return 0.0; }
 let delta = (uv - params.centerSize.xy) * params.resolutionModeBlock.xy;
 let angle = radians(params.controls.x);
 let c = cos(angle);
 let s = sin(angle);
 let local = vec2f(c * delta.x + s * delta.y, -s * delta.x + c * delta.y);
 let ellipseProgress = clamp(length(local / radii), 0.0, 1.0);
 let distance = 1.0 - params.controls.y;
 if (abs(distance) <= 0.0000001) { return step(params.controls.y, ellipseProgress); }
 return clamp((ellipseProgress - params.controls.y) / distance, 0.0, 1.0);
}
fn samplePixelated(uv: vec2f, blockSize: f32) -> vec4f {
 let pixelSizeUv = vec2f(blockSize) / params.resolutionModeBlock.xy;
 let blockUv = floor(uv / pixelSizeUv) * pixelSizeUv + pixelSizeUv * 0.5;
 return textureSampleLevel(source, sourceSampler, vec2f(blockUv.x, 1.0 - blockUv.y), 0);
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
 var progress: f32;
 if (params.resolutionModeBlock.z == 0.0) { progress = linearProgress(input.uv); }
 else { progress = radialProgress(input.uv); }
 let targetBlockSize = max(1.0, mix(params.resolutionModeBlock.w, params.controls.z, progress));
 let level = log2(targetBlockSize);
 let lowerBlockSize = exp2(floor(level));
 let upperBlockSize = lowerBlockSize * 2.0;
 let levelProgress = fract(level);
 let uv = vec2f(input.uv.x, 1.0 - input.uv.y);
 return mix(samplePixelated(uv, lowerBlockSize), samplePixelated(uv, upperBlockSize), levelProgress);
}
`;



__webpack_require__.d(__webpack_exports__, {
}, {
  Gn: PROGRESSIVE_PIXELATE_WEBGPU_SHADER,
  _p: drawProgressivePixelate,
  bW: prepareProgressivePixelate,
  py: setupProgressivePixelate,
  sc: cleanupProgressivePixelate
});


},
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
4207(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_00v3hr66_mjs__rspack_import_0 = __webpack_require__(2199);
/* import */ var _index_wxhvgv2s_mjs__rspack_import_3 = __webpack_require__(8197);
/* import */ var _index_tvfexb7s_mjs__rspack_import_4 = __webpack_require__(4541);
/* import */ var _index_4fvp93ps_mjs__rspack_import_2 = __webpack_require__(4075);
/* import */ var remotion__rspack_import_1 = __webpack_require__(3947);





// src/radial-progressive-pixelate/index.ts

var { createEffect } = remotion__rspack_import_1.Internals;
var DEFAULT_CENTER = [0.5, 0.5];
var DEFAULT_WIDTH = 1;
var DEFAULT_HEIGHT = 1;
var DEFAULT_ROTATION = 0;
var DEFAULT_START = 0;
var DEFAULT_START_BLOCK_SIZE = 1;
var DEFAULT_END_BLOCK_SIZE = 40;
var radialProgressivePixelateSchema = {
  center: {
    type: "uv-coordinate",
    min: -1,
    max: 2,
    step: 0.01,
    default: DEFAULT_CENTER,
    description: "Center",
    visual: {
      type: "ellipse",
      width: "width",
      height: "height",
      rotation: "rotation",
      innerScale: "start"
    }
  },
  width: {
    type: "number",
    min: 0,
    step: 0.01,
    default: DEFAULT_WIDTH,
    description: "Width",
    hiddenFromList: false
  },
  height: {
    type: "number",
    min: 0,
    step: 0.01,
    default: DEFAULT_HEIGHT,
    description: "Height",
    hiddenFromList: false
  },
  rotation: {
    type: "rotation-degrees",
    step: 1,
    default: DEFAULT_ROTATION,
    description: "Rotation"
  },
  start: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_START,
    description: "Start",
    hiddenFromList: false
  },
  startBlockSize: {
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: DEFAULT_START_BLOCK_SIZE,
    description: "Start block size",
    hiddenFromList: false
  },
  endBlockSize: {
    type: "number",
    min: 1,
    max: 200,
    step: 1,
    default: DEFAULT_END_BLOCK_SIZE,
    description: "End block size",
    hiddenFromList: false
  }
};
var resolve = (params) => ({
  center: [
    ...params.center ?? DEFAULT_CENTER
  ],
  width: params.width ?? DEFAULT_WIDTH,
  height: params.height ?? DEFAULT_HEIGHT,
  rotation: params.rotation ?? DEFAULT_ROTATION,
  start: params.start ?? DEFAULT_START,
  startBlockSize: params.startBlockSize ?? DEFAULT_START_BLOCK_SIZE,
  endBlockSize: params.endBlockSize ?? DEFAULT_END_BLOCK_SIZE
});
var assertOptionalUvCoordinate = (value, name) => {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new TypeError(`"${name}" must be a [number, number] tuple`);
  }
};
var validateBlockSize = (value, name) => {
  if (value < 1) {
    throw new TypeError(`"${name}" must be >= 1`);
  }
};
var validateParams = (params) => {
  (0,_index_4fvp93ps_mjs__rspack_import_2/* .assertEffectParamsObject */.db)(params, "Radial progressive pixelate");
  assertOptionalUvCoordinate(params.center, "center");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.width, "width");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.height, "height");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.rotation, "rotation");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateNonNegative */.XP)(params.width ?? DEFAULT_WIDTH, "width");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateNonNegative */.XP)(params.height ?? DEFAULT_HEIGHT, "height");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.start, "start");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateUnitInterval */.yk)(params.start ?? DEFAULT_START, "start");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.startBlockSize, "startBlockSize");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.endBlockSize, "endBlockSize");
  validateBlockSize(params.startBlockSize ?? DEFAULT_START_BLOCK_SIZE, "startBlockSize");
  validateBlockSize(params.endBlockSize ?? DEFAULT_END_BLOCK_SIZE, "endBlockSize");
};
var radialProgressivePixelate = createEffect({
  type: "dev.remotion.effects.radialProgressivePixelate",
  label: "radialProgressivePixelate()",
  documentationLink: "https://www.remotion.dev/docs/effects/radial-progressive-pixelate",
  calculateKey: (params) => {
    const r = resolve(params);
    return `radial-progressive-pixelate-${r.center.join(":")}-${r.width}-${r.height}-${r.rotation}-${r.start}-${r.startBlockSize}-${r.endBlockSize}`;
  },
  implementations: {
    webgpu: remotion__rspack_import_1.Internals.createEffectImplementation({
      setup: (target) => (0,_index_tvfexb7s_mjs__rspack_import_4/* .setupWebGpuSinglePass */.DS)(target, "radial-progressive-pixelate"),
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice) {
          throw new Error("A WebGPU device is required for the radial-progressive-pixelate effect");
        }
        const r = resolve(params);
        (0,_index_tvfexb7s_mjs__rspack_import_4/* .applyWebGpuSinglePass */.UI)({
          source,
          width,
          height,
          state,
          device: gpuDevice,
          shader: _index_00v3hr66_mjs__rspack_import_0/* .PROGRESSIVE_PIXELATE_WEBGPU_SHADER */.Gn,
          uniformData: new Float32Array([
            width,
            height,
            1,
            r.startBlockSize,
            0,
            0,
            0,
            0,
            r.center[0],
            r.center[1],
            r.width,
            r.height,
            r.rotation,
            r.start,
            r.endBlockSize,
            0
          ])
        });
      },
      cleanup: _index_tvfexb7s_mjs__rspack_import_4/* .cleanupWebGpuSinglePass */.Gl
    }),
    webgl2: remotion__rspack_import_1.Internals.createEffectImplementation({
      setup: _index_00v3hr66_mjs__rspack_import_0/* .setupProgressivePixelate */.py,
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        const r = resolve(params);
        (0,_index_00v3hr66_mjs__rspack_import_0/* .prepareProgressivePixelate */.bW)({
          state,
          source,
          width,
          height,
          flipSourceY
        });
        const { gl, uniforms } = state;
        if (uniforms.uMode)
          gl.uniform1i(uniforms.uMode, 1);
        if (uniforms.uCenter)
          gl.uniform2f(uniforms.uCenter, r.center[0], r.center[1]);
        if (uniforms.uWidth)
          gl.uniform1f(uniforms.uWidth, r.width);
        if (uniforms.uHeight)
          gl.uniform1f(uniforms.uHeight, r.height);
        if (uniforms.uRotation)
          gl.uniform1f(uniforms.uRotation, r.rotation);
        if (uniforms.uRadialStart)
          gl.uniform1f(uniforms.uRadialStart, r.start);
        if (uniforms.uStartBlockSize)
          gl.uniform1f(uniforms.uStartBlockSize, r.startBlockSize);
        if (uniforms.uEndBlockSize)
          gl.uniform1f(uniforms.uEndBlockSize, r.endBlockSize);
        (0,_index_00v3hr66_mjs__rspack_import_0/* .drawProgressivePixelate */._p)(state);
      },
      cleanup: _index_00v3hr66_mjs__rspack_import_0/* .cleanupProgressivePixelate */.sc
    })
  },
  schema: radialProgressivePixelateSchema,
  validateParams
});


__webpack_require__.d(__webpack_exports__, {
}, {
  radialProgressivePixelate: radialProgressivePixelate
});


},

}]);
//# sourceMappingURL=6628.bundle.js.map