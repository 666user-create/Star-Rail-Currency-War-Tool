"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[9701], {
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
224(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
/* import */ var _index_kkvzt8b7_mjs__rspack_import_0 = __webpack_require__(7223);


// src/gaussian-blur-webgpu-shader.ts
var GAUSSIAN_BLUR_WEBGPU_SHADER = `
${_index_kkvzt8b7_mjs__rspack_import_0/* .WEBGPU_MULTIPASS_BINDINGS */.NK}
struct Params { resolution: vec2f, direction: vec2f, values: vec4f, startEnd: vec4f, radial: vec4f, }
fn radiusAt(uv: vec2f) -> f32 {
 let mode = params.values.y;
 if (mode == 0.0) {return params.values.x;}
 if (mode == 1.0) {
  let gradient = params.startEnd.zw - params.startEnd.xy;
  let lengthSq = dot(gradient, gradient);
  if (lengthSq <= 0.0000001) {return max(0.0, params.values.z);}
  let progress = clamp(dot(uv - params.startEnd.xy, gradient) / lengthSq, 0.0, 1.0);
  return max(0.0, mix(params.values.z, params.values.w, progress));
 }
 let radii = params.startEnd.zw * params.resolution * 0.5;
 if (radii.x <= 0.0000001 || radii.y <= 0.0000001) {return max(0.0, params.values.z);}
 let delta = (uv - params.startEnd.xy) * params.resolution;
 let angle = radians(params.radial.x);
 let c = cos(angle); let s = sin(angle);
 let local = vec2f(c * delta.x + s * delta.y, -s * delta.x + c * delta.y);
 let ellipseProgress = clamp(length(local / radii), 0.0, 1.0);
 let distance = 1.0 - params.radial.y;
 var progress = step(params.radial.y, ellipseProgress);
 if (abs(distance) > 0.0000001) {progress = clamp((ellipseProgress - params.radial.y) / distance, 0.0, 1.0);}
 return max(0.0, mix(params.values.z, params.values.w, progress));
}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
 let radius = radiusAt(input.uv);
 if (radius <= 0.0) {return textureSampleLevel(source, sourceSampler, input.uv, 0);}
 let halfKernel = i32(clamp(ceil(radius / 2.0), 4.0, 32.0));
 let stride = radius / f32(halfKernel);
 let sigma = select(max(radius / 3.0, 0.0001), radius / 3.0, params.values.y == 0.0);
 let twoSigmaSq = 2.0 * sigma * sigma;
 var sum = vec4f(0); var weightSum = 0.0;
 for (var i = -32; i <= 32; i++) {
  if (abs(i) > halfKernel) {continue;}
  let offset = f32(i) * stride;
  let weight = exp(-(offset * offset) / twoSigmaSq);
  let uv = input.uv + params.direction / params.resolution * offset;
  sum += textureSampleLevel(source, sourceSampler, uv, 0) * weight;
  weightSum += weight;
 }
 return sum / weightSum;
}
`;



__webpack_require__.d(__webpack_exports__, {
}, {
  j: GAUSSIAN_BLUR_WEBGPU_SHADER
});


},
7223(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
/* import */ var _index_tvfexb7s_mjs__rspack_import_0 = __webpack_require__(4541);


// src/webgpu-multipass-runtime.ts
var WEBGPU_MULTIPASS_BINDINGS = `
${_index_tvfexb7s_mjs__rspack_import_0/* .WEBGPU_SINGLE_PASS_VERTEX */.fH}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var secondary: texture_2d<f32>;
`;
var setupWebGpuMultipass = (target, label) => {
  const context = target.getContext("webgpu");
  if (!context)
    throw new Error(`WebGPU is not available for the ${label} effect`);
  return { context, label, resources: null };
};
var cleanupWebGpuMultipass = (state) => {
  state.resources?.source?.texture.destroy();
  state.resources?.auxiliary?.texture.destroy();
  state.resources?.textures.forEach((texture) => texture.destroy());
  state.resources?.passes.forEach((pass) => pass.uniforms.destroy());
  state.resources = null;
  state.context.unconfigure();
};
var applyWebGpuMultipass = ({
  state,
  source,
  width,
  height,
  device,
  passes,
  auxiliarySource
}) => {
  if (state.resources && state.resources.device !== device)
    cleanupWebGpuMultipass(state);
  if (!state.resources) {
    const format = navigator.gpu.getPreferredCanvasFormat();
    state.context.configure({ device, format, alphaMode: "premultiplied" });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} }
      ]
    });
    state.resources = {
      device,
      format,
      layout,
      sampler: device.createSampler({ magFilter: "linear", minFilter: "linear" }),
      passes: [],
      textures: [],
      source: null,
      auxiliary: null,
      width,
      height
    };
  }
  const r = state.resources;
  const sourceWidth = "displayWidth" in source ? source.displayWidth : ("videoWidth" in source) ? source.videoWidth : ("naturalWidth" in source) ? source.naturalWidth : typeof source.width === "number" ? source.width : source.width.baseVal.value;
  const sourceHeight = "displayHeight" in source ? source.displayHeight : ("videoHeight" in source) ? source.videoHeight : ("naturalHeight" in source) ? source.naturalHeight : typeof source.height === "number" ? source.height : source.height.baseVal.value;
  if (r.source && (r.source.width !== sourceWidth || r.source.height !== sourceHeight)) {
    r.source.texture.destroy();
    r.source = null;
  }
  if (!r.source) {
    r.source = {
      width: sourceWidth,
      height: sourceHeight,
      texture: device.createTexture({
        size: [sourceWidth, sourceHeight],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      })
    };
  }
  device.queue.copyExternalImageToTexture({ source }, { texture: r.source.texture, premultipliedAlpha: true }, [sourceWidth, sourceHeight]);
  if (r.auxiliary && (!auxiliarySource || r.auxiliary.width !== auxiliarySource.width || r.auxiliary.height !== auxiliarySource.height)) {
    r.auxiliary.texture.destroy();
    r.auxiliary = null;
  }
  if (auxiliarySource) {
    if (!r.auxiliary)
      r.auxiliary = {
        width: auxiliarySource.width,
        height: auxiliarySource.height,
        texture: device.createTexture({
          size: [auxiliarySource.width, auxiliarySource.height],
          format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        })
      };
    device.queue.copyExternalImageToTexture({ source: auxiliarySource }, { texture: r.auxiliary.texture, premultipliedAlpha: true }, [auxiliarySource.width, auxiliarySource.height]);
  }
  if (r.width !== width || r.height !== height) {
    r.textures.forEach((texture) => texture.destroy());
    r.textures.length = 0;
    r.width = width;
    r.height = height;
  }
  const lastReaders = passes.map((_, index) => index);
  for (let index = 0;index < passes.length; index++) {
    for (const input of [passes[index].source, passes[index].secondary]) {
      if (input >= 0)
        lastReaders[input] = index;
    }
  }
  const outputSlots = [];
  const freeAfter = [];
  for (let index = 0;index < passes.length - 1; index++) {
    let slot = freeAfter.findIndex((lastReader) => lastReader < index);
    if (slot === -1)
      slot = freeAfter.length;
    freeAfter[slot] = lastReaders[index];
    outputSlots.push(slot);
  }
  while (r.textures.length < freeAfter.length) {
    r.textures.push(device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    }));
  }
  while (r.textures.length > freeAfter.length)
    r.textures.pop()?.destroy();
  while (r.passes.length > passes.length)
    r.passes.pop()?.uniforms.destroy();
  const encoder = device.createCommandEncoder();
  for (let index = 0;index < passes.length; index++) {
    const pass = passes[index];
    const format = index === passes.length - 1 ? r.format : "rgba8unorm";
    const size = Math.max(16, Math.ceil(pass.uniforms.byteLength / 16) * 16);
    let resources = r.passes[index];
    if (!resources || resources.shader !== pass.shader || resources.size !== size || resources.format !== format) {
      resources?.uniforms.destroy();
      const module = device.createShaderModule({
        code: pass.shader,
        label: state.label
      });
      resources = {
        shader: pass.shader,
        size,
        format,
        pipeline: device.createRenderPipeline({
          label: state.label,
          layout: device.createPipelineLayout({ bindGroupLayouts: [r.layout] }),
          vertex: { module, entryPoint: "vertex" },
          fragment: { module, entryPoint: "fragment", targets: [{ format }] },
          primitive: { topology: "triangle-list" }
        }),
        uniforms: device.createBuffer({
          size,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })
      };
      r.passes[index] = resources;
    }
    device.queue.writeBuffer(resources.uniforms, 0, pass.uniforms);
    const bindGroup = device.createBindGroup({
      layout: r.layout,
      entries: [
        {
          binding: 0,
          resource: (pass.source === -1 ? r.source.texture : r.textures[outputSlots[pass.source]]).createView()
        },
        { binding: 1, resource: r.sampler },
        { binding: 2, resource: { buffer: resources.uniforms } },
        {
          binding: 3,
          resource: (pass.secondary === -2 && r.auxiliary ? r.auxiliary.texture : pass.secondary === -1 ? r.source.texture : r.textures[outputSlots[pass.secondary]]).createView()
        }
      ]
    });
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: (index === passes.length - 1 ? state.context.getCurrentTexture() : r.textures[outputSlots[index]]).createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    renderPass.setPipeline(resources.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(3);
    renderPass.end();
  }
  device.queue.submit([encoder.finish()]);
};



__webpack_require__.d(__webpack_exports__, {
}, {
  $h: cleanupWebGpuMultipass,
  JM: applyWebGpuMultipass,
  NK: WEBGPU_MULTIPASS_BINDINGS,
  SB: setupWebGpuMultipass
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
8564(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_kkvzt8b7_mjs__rspack_import_0 = __webpack_require__(7223);
/* import */ var _index_618ky75w_mjs__rspack_import_1 = __webpack_require__(224);
/* import */ var _index_wxhvgv2s_mjs__rspack_import_4 = __webpack_require__(8197);
/* import */ var _index_4fvp93ps_mjs__rspack_import_3 = __webpack_require__(4075);
/* import */ var remotion__rspack_import_2 = __webpack_require__(3947);





// src/radial-progressive-blur/index.ts


// src/radial-progressive-blur/radial-progressive-blur-runtime.ts


// src/radial-progressive-blur/radial-progressive-blur-shaders.ts
var RADIAL_PROGRESSIVE_BLUR_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
	vUv = aUv;
	gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
var buildRadialProgressiveBlurFs = (direction) => {
  const dirVec = direction === "horizontal" ? "vec2(1.0, 0.0)" : "vec2(0.0, 1.0)";
  return `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform vec2 uCenter;
uniform float uWidth;
uniform float uHeight;
uniform float uRotation;
uniform float uStart;
uniform float uStartBlur;
uniform float uEndBlur;

const int MIN_KERNEL_HALF = 4;
const int MAX_KERNEL_HALF = 32;
const float TARGET_SAMPLE_DISTANCE_PX = 2.0;
const vec2 DIRECTION = ${dirVec};

float progressiveRadius(vec2 uv) {
	vec2 radii = vec2(uWidth / uTexelSize.x, uHeight / uTexelSize.y) * 0.5;

	if (radii.x <= 0.0000001 || radii.y <= 0.0000001) {
		return max(0.0, uStartBlur);
	}

	vec2 delta = (uv - uCenter) / uTexelSize;
	float angle = radians(uRotation);
	float c = cos(angle);
	float s = sin(angle);
	vec2 local = vec2(
		c * delta.x + s * delta.y,
		-s * delta.x + c * delta.y
	);
	float ellipseProgress = clamp(length(local / radii), 0.0, 1.0);
	float distance = 1.0 - uStart;
	float progress = abs(distance) <= 0.0000001
		? step(uStart, ellipseProgress)
		: clamp((ellipseProgress - uStart) / distance, 0.0, 1.0);
	return max(0.0, mix(uStartBlur, uEndBlur, progress));
}

void main() {
	// Public UV coordinates use top-left origin, matching canvas/CSS coordinates.
	float radius = progressiveRadius(vec2(vUv.x, 1.0 - vUv.y));
	if (radius <= 0.0) {
		fragColor = texture(uSource, vUv);
		return;
	}

	int kernelHalf = int(
		min(
			float(MAX_KERNEL_HALF),
			max(float(MIN_KERNEL_HALF), ceil(radius / TARGET_SAMPLE_DISTANCE_PX))
		)
	);
	float pixelStride = radius / float(kernelHalf);
	float sigma = max(radius / 3.0, 0.0001);
	float twoSigmaSq = 2.0 * sigma * sigma;

	vec4 sum = vec4(0.0);
	float weightSum = 0.0;

	for (int i = -MAX_KERNEL_HALF; i <= MAX_KERNEL_HALF; ++i) {
		if (abs(i) > kernelHalf) {
			continue;
		}

		float offsetPx = float(i) * pixelStride;
		float w = exp(-(offsetPx * offsetPx) / twoSigmaSq);
		vec2 uv = vUv + DIRECTION * uTexelSize * offsetPx;
		sum += texture(uSource, uv) * w;
		weightSum += w;
	}

	fragColor = sum / weightSum;
}
`;
};

// src/radial-progressive-blur/radial-progressive-blur-runtime.ts
var { createWebGL2ContextError } = remotion__rspack_import_2.Internals;
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
    throw new Error(`Radial progressive blur shader compile failed: ${log ?? "(no log)"}`);
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
    throw new Error(`Radial progressive blur program link failed: ${log ?? "(no log)"}`);
  }
  return program;
};
var createProgram = (gl, vertexSource, fragmentSource) => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = linkProgram(gl, vs, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
};
var getUniforms = (gl, program) => ({
  uSource: gl.getUniformLocation(program, "uSource"),
  uTexelSize: gl.getUniformLocation(program, "uTexelSize"),
  uCenter: gl.getUniformLocation(program, "uCenter"),
  uWidth: gl.getUniformLocation(program, "uWidth"),
  uHeight: gl.getUniformLocation(program, "uHeight"),
  uRotation: gl.getUniformLocation(program, "uRotation"),
  uStart: gl.getUniformLocation(program, "uStart"),
  uStartBlur: gl.getUniformLocation(program, "uStartBlur"),
  uEndBlur: gl.getUniformLocation(program, "uEndBlur")
});
var createRgbaTexture = (gl) => {
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
  return texture;
};
var setupRadialProgressiveBlur = (target) => {
  const gl = target.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  if (!gl) {
    throw createWebGL2ContextError("radial progressive blur effect");
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const programHorizontal = createProgram(gl, RADIAL_PROGRESSIVE_BLUR_VS, buildRadialProgressiveBlurFs("horizontal"));
  const programVertical = createProgram(gl, RADIAL_PROGRESSIVE_BLUR_VS, buildRadialProgressiveBlurFs("vertical"));
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
  const textureSource = createRgbaTexture(gl);
  const textureIntermediate = createRgbaTexture(gl);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    throw new Error("Failed to create WebGL framebuffer");
  }
  const w = Math.max(1, target.width);
  const h = Math.max(1, target.height);
  gl.bindTexture(gl.TEXTURE_2D, textureIntermediate);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureIntermediate, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Radial progressive blur framebuffer incomplete: 0x${status.toString(16)}`);
  }
  return {
    gl,
    programHorizontal,
    programVertical,
    vao,
    vbo,
    textureSource,
    textureIntermediate,
    framebuffer,
    horizontal: getUniforms(gl, programHorizontal),
    vertical: getUniforms(gl, programVertical)
  };
};
var cleanupRadialProgressiveBlur = (state) => {
  const {
    gl,
    programHorizontal,
    programVertical,
    vao,
    vbo,
    textureSource,
    textureIntermediate,
    framebuffer
  } = state;
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(textureSource);
  gl.deleteTexture(textureIntermediate);
  gl.deleteBuffer(vbo);
  gl.deleteProgram(programHorizontal);
  gl.deleteProgram(programVertical);
  gl.deleteVertexArray(vao);
};
var uploadSource = ({
  gl,
  textureSource,
  textureIntermediate,
  source,
  width,
  height,
  flipSourceY
}) => {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipSourceY);
  gl.bindTexture(gl.TEXTURE_2D, textureSource);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.bindTexture(gl.TEXTURE_2D, textureIntermediate);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
};
var setUniforms = ({
  gl,
  uniforms,
  width,
  height,
  params
}) => {
  if (uniforms.uSource)
    gl.uniform1i(uniforms.uSource, 0);
  if (uniforms.uTexelSize)
    gl.uniform2f(uniforms.uTexelSize, 1 / width, 1 / height);
  if (uniforms.uCenter)
    gl.uniform2f(uniforms.uCenter, params.center[0], params.center[1]);
  if (uniforms.uWidth)
    gl.uniform1f(uniforms.uWidth, params.width);
  if (uniforms.uHeight)
    gl.uniform1f(uniforms.uHeight, params.height);
  if (uniforms.uRotation)
    gl.uniform1f(uniforms.uRotation, params.rotation);
  if (uniforms.uStart)
    gl.uniform1f(uniforms.uStart, params.start);
  if (uniforms.uStartBlur)
    gl.uniform1f(uniforms.uStartBlur, params.startBlur);
  if (uniforms.uEndBlur)
    gl.uniform1f(uniforms.uEndBlur, params.endBlur);
};
var drawFullscreenQuad = (state) => {
  const { gl, vao } = state;
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
};
var applyRadialProgressiveBlur = ({
  state,
  source,
  width,
  height,
  params,
  flipSourceY
}) => {
  const {
    gl,
    programHorizontal,
    programVertical,
    textureSource,
    textureIntermediate,
    framebuffer
  } = state;
  gl.viewport(0, 0, width, height);
  uploadSource({
    gl,
    textureSource,
    textureIntermediate,
    source,
    width,
    height,
    flipSourceY
  });
  gl.clearColor(0, 0, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textureSource);
  gl.useProgram(programHorizontal);
  setUniforms({
    gl,
    uniforms: state.horizontal,
    width,
    height,
    params
  });
  drawFullscreenQuad(state);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindTexture(gl.TEXTURE_2D, textureIntermediate);
  gl.useProgram(programVertical);
  setUniforms({
    gl,
    uniforms: state.vertical,
    width,
    height,
    params
  });
  drawFullscreenQuad(state);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.useProgram(null);
};

// src/radial-progressive-blur/index.ts
var { createEffect } = remotion__rspack_import_2.Internals;
var DEFAULT_CENTER = [0.5, 0.5];
var DEFAULT_WIDTH = 1;
var DEFAULT_HEIGHT = 1;
var DEFAULT_ROTATION = 0;
var DEFAULT_START = 0;
var DEFAULT_START_BLUR = 0;
var DEFAULT_END_BLUR = 50;
var radialProgressiveBlurSchema = {
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
  startBlur: {
    type: "number",
    min: 0,
    max: 200,
    step: 1,
    default: DEFAULT_START_BLUR,
    description: "Start blur",
    hiddenFromList: false
  },
  endBlur: {
    type: "number",
    min: 0,
    max: 200,
    step: 1,
    default: DEFAULT_END_BLUR,
    description: "End blur",
    hiddenFromList: false
  }
};
var clampBlur = (value) => Math.max(0, value);
var resolveRadialProgressiveBlurParams = (params) => ({
  center: [
    ...params.center ?? DEFAULT_CENTER
  ],
  width: params.width ?? DEFAULT_WIDTH,
  height: params.height ?? DEFAULT_HEIGHT,
  rotation: params.rotation ?? DEFAULT_ROTATION,
  start: params.start ?? DEFAULT_START,
  startBlur: clampBlur(params.startBlur ?? DEFAULT_START_BLUR),
  endBlur: clampBlur(params.endBlur ?? DEFAULT_END_BLUR)
});
var assertOptionalUvCoordinate = (value, name) => {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new TypeError(`"${name}" must be a [number, number] tuple`);
  }
};
var validateRadialProgressiveBlurParams = (params) => {
  (0,_index_4fvp93ps_mjs__rspack_import_3/* .assertEffectParamsObject */.db)(params, "Radial progressive blur");
  assertOptionalUvCoordinate(params.center, "center");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .assertOptionalFiniteNumber */.FC)(params.width, "width");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .assertOptionalFiniteNumber */.FC)(params.height, "height");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .assertOptionalFiniteNumber */.FC)(params.rotation, "rotation");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .validateNonNegative */.XP)(params.width ?? DEFAULT_WIDTH, "width");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .validateNonNegative */.XP)(params.height ?? DEFAULT_HEIGHT, "height");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .assertOptionalFiniteNumber */.FC)(params.start, "start");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .validateUnitInterval */.yk)(params.start ?? DEFAULT_START, "start");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .assertOptionalFiniteNumber */.FC)(params.startBlur, "startBlur");
  (0,_index_wxhvgv2s_mjs__rspack_import_4/* .assertOptionalFiniteNumber */.FC)(params.endBlur, "endBlur");
};
var radialProgressiveBlur = createEffect({
  type: "dev.remotion.effects.radialProgressiveBlur",
  label: "radialProgressiveBlur()",
  documentationLink: "https://www.remotion.dev/docs/effects/radial-progressive-blur",
  calculateKey: (params) => {
    const r = resolveRadialProgressiveBlurParams(params);
    return `radial-progressive-blur-${r.center.join(":")}-${r.width}-${r.height}-${r.rotation}-${r.start}-${r.startBlur}-${r.endBlur}`;
  },
  implementations: {
    webgpu: remotion__rspack_import_2.Internals.createEffectImplementation({
      setup: (target) => (0,_index_kkvzt8b7_mjs__rspack_import_0/* .setupWebGpuMultipass */.SB)(target, "radial-progressive-blur"),
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice)
          throw new Error("A WebGPU device is required for this effect");
        const r = resolveRadialProgressiveBlurParams(params);
        (0,_index_kkvzt8b7_mjs__rspack_import_0/* .applyWebGpuMultipass */.JM)({
          auxiliarySource: null,
          state,
          source,
          width,
          height,
          device: gpuDevice,
          passes: [
            {
              shader: _index_618ky75w_mjs__rspack_import_1/* .GAUSSIAN_BLUR_WEBGPU_SHADER */.j,
              uniforms: new Float32Array([
                width,
                height,
                1,
                0,
                0,
                2,
                r.startBlur,
                r.endBlur,
                ...r.center,
                r.width,
                r.height,
                r.rotation,
                r.start,
                0,
                0
              ]),
              source: -1,
              secondary: -1
            },
            {
              shader: _index_618ky75w_mjs__rspack_import_1/* .GAUSSIAN_BLUR_WEBGPU_SHADER */.j,
              uniforms: new Float32Array([
                width,
                height,
                0,
                1,
                0,
                2,
                r.startBlur,
                r.endBlur,
                ...r.center,
                r.width,
                r.height,
                r.rotation,
                r.start,
                0,
                0
              ]),
              source: 0,
              secondary: -1
            }
          ]
        });
      },
      cleanup: _index_kkvzt8b7_mjs__rspack_import_0/* .cleanupWebGpuMultipass */.$h
    }),
    webgl2: remotion__rspack_import_2.Internals.createEffectImplementation({
      setup: (target) => setupRadialProgressiveBlur(target),
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        const r = resolveRadialProgressiveBlurParams(params);
        applyRadialProgressiveBlur({
          state,
          source,
          width,
          height,
          params: r,
          flipSourceY
        });
      },
      cleanup: (state) => cleanupRadialProgressiveBlur(state)
    })
  },
  schema: radialProgressiveBlurSchema,
  validateParams: validateRadialProgressiveBlurParams
});


__webpack_require__.d(__webpack_exports__, {
}, {
  radialProgressiveBlur: radialProgressiveBlur
});


},

}]);
//# sourceMappingURL=9701.bundle.js.map