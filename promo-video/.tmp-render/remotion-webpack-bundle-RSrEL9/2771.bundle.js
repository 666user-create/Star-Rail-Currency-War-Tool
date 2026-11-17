"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[2771], {
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
1262(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_wxhvgv2s_mjs__rspack_import_3 = __webpack_require__(8197);
/* import */ var _index_tvfexb7s_mjs__rspack_import_1 = __webpack_require__(4541);
/* import */ var _index_4fvp93ps_mjs__rspack_import_2 = __webpack_require__(4075);
/* import */ var remotion__rspack_import_0 = __webpack_require__(3947);




// src/speckle.ts


// src/speckle-webgpu-shader.ts
var SPECKLE_WEBGPU_SHADER = `
${_index_tvfexb7s_mjs__rspack_import_1/* .WEBGPU_SINGLE_PASS_VERTEX */.fH}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

struct Params { size: vec2f, density: f32, radius: f32, randomness: f32, }

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(p.xyx * vec3f(443.8975, 397.2973, 491.1871));
  p3 += vec3f(dot(p3, p3.yzx + vec3f(19.19)));
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f { return vec2f(hash21(p + vec2f(17.13)), hash21(p + vec2f(83.71))); }
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSampleLevel(source, sourceSampler, input.uv, 0);
  if (params.density <= 0.0 || params.radius <= 0.0) { return color; }
  let fragPos = vec2f(input.uv.x, 1.0 - input.uv.y) * params.size;
  let cellSize = max(params.radius * 2.5, 1.0);
  let baseCell = floor(fragPos / cellSize);
  var hole = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let cell = baseCell + vec2f(f32(x), f32(y));
      if (hash21(cell) <= params.density) {
        let randomOffset = (hash22(cell + vec2f(11.7)) - vec2f(0.5)) * params.randomness;
        let center = (cell + vec2f(0.5) + randomOffset) * cellSize;
        let variation = mix(1.0, 0.35 + hash21(cell + vec2f(29.43)) * 0.65, params.randomness);
        let radius = params.radius * 0.5 * variation;
        let edge = min(1.0, max(radius * 0.5, 0.35));
        hole = max(hole, 1.0 - smoothstep(radius - edge, radius + edge, length(fragPos - center)));
      }
    }
  }
  return color * (1.0 - clamp(hole, 0.0, 1.0));
}

`;

// src/speckle.ts
var { createEffect, createWebGL2ContextError } = remotion__rspack_import_0.Internals;
var DEFAULT_DENSITY = 0.08;
var DEFAULT_SIZE = 4;
var DEFAULT_RANDOMNESS = 1;
var speckleSchema = {
  density: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_DENSITY,
    description: "Density",
    hiddenFromList: false
  },
  size: {
    type: "number",
    min: 0,
    max: 50,
    step: 0.1,
    default: DEFAULT_SIZE,
    description: "Size",
    hiddenFromList: false
  },
  randomness: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_RANDOMNESS,
    description: "Randomness",
    hiddenFromList: false
  }
};
var resolve = (p) => ({
  density: p.density ?? DEFAULT_DENSITY,
  size: p.size ?? DEFAULT_SIZE,
  randomness: p.randomness ?? DEFAULT_RANDOMNESS
});
var validateSpeckleParams = (params) => {
  (0,_index_4fvp93ps_mjs__rspack_import_2/* .assertEffectParamsObject */.db)(params, "Speckle");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.density, "density");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.size, "size");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .assertOptionalFiniteNumber */.FC)(params.randomness, "randomness");
  const r = resolve(params);
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateUnitInterval */.yk)(r.density, "density");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateNonNegative */.XP)(r.size, "size");
  (0,_index_wxhvgv2s_mjs__rspack_import_3/* .validateUnitInterval */.yk)(r.randomness, "randomness");
};
var SPECKLE_VS = `#version 300 es
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;

void main() {
	vUv = aUv;
	gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
var SPECKLE_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uDensity;
uniform float uSize;
uniform float uRandomness;

float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(443.8975, 397.2973, 491.1871));
	p3 += dot(p3, p3.yzx + 19.19);
	return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
	return vec2(hash21(p + 17.13), hash21(p + 83.71));
}

void main() {
	vec4 color = texture(uSource, vUv);

	if (uDensity <= 0.0 || uSize <= 0.0) {
		fragColor = color;
		return;
	}

	vec2 fragPos = vUv * uResolution;
	float cellSize = max(uSize * 2.5, 1.0);
	vec2 baseCell = floor(fragPos / cellSize);
	float hole = 0.0;

	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 cell = baseCell + vec2(float(x), float(y));
			float chance = hash21(cell);

			if (chance <= uDensity) {
				vec2 randomOffset = (hash22(cell + 11.7) - 0.5) * uRandomness;
				vec2 center = (cell + 0.5 + randomOffset) * cellSize;
				float sizeVariation = mix(1.0, 0.35 + hash21(cell + 29.43) * 0.65, uRandomness);
				float radius = uSize * 0.5 * sizeVariation;
				float edge = min(1.0, max(radius * 0.5, 0.35));
				float coverage = 1.0 - smoothstep(radius - edge, radius + edge, length(fragPos - center));
				hole = max(hole, coverage);
			}
		}
	}

	fragColor = color * (1.0 - clamp(hole, 0.0, 1.0));
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
    throw new Error(`Speckle shader compile failed: ${log ?? "(no log)"}`);
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
    throw new Error(`Speckle program link failed: ${log ?? "(no log)"}`);
  }
  return program;
};
var speckle = createEffect({
  type: "dev.remotion.effects.speckle",
  label: "speckle()",
  documentationLink: "https://www.remotion.dev/docs/effects/speckle",
  calculateKey: (params) => {
    const r = resolve(params);
    return `speckle-${r.density}-${r.size}-${r.randomness}`;
  },
  implementations: {
    webgpu: remotion__rspack_import_0.Internals.createEffectImplementation({
      setup: (target) => (0,_index_tvfexb7s_mjs__rspack_import_1/* .setupWebGpuSinglePass */.DS)(target, "speckle"),
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice)
          throw new Error("A WebGPU device is required for the speckle effect");
        const r = resolve(params);
        const uniformData = new Float32Array([
          width,
          height,
          r.density,
          r.size,
          r.randomness,
          0,
          0,
          0
        ]);
        (0,_index_tvfexb7s_mjs__rspack_import_1/* .applyWebGpuSinglePass */.UI)({
          state,
          source,
          width,
          height,
          device: gpuDevice,
          shader: SPECKLE_WEBGPU_SHADER,
          uniformData
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
          throw createWebGL2ContextError("speckle effect");
        }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        const vs = compileShader(gl, gl.VERTEX_SHADER, SPECKLE_VS);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, SPECKLE_FS);
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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return {
          gl,
          program,
          vao,
          vbo,
          texture,
          uSource: gl.getUniformLocation(program, "uSource"),
          uResolution: gl.getUniformLocation(program, "uResolution"),
          uDensity: gl.getUniformLocation(program, "uDensity"),
          uSize: gl.getUniformLocation(program, "uSize"),
          uRandomness: gl.getUniformLocation(program, "uRandomness")
        };
      },
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        const r = resolve(params);
        const { gl, program, vao, texture } = state;
        gl.viewport(0, 0, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipSourceY);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (state.uSource)
          gl.uniform1i(state.uSource, 0);
        if (state.uResolution)
          gl.uniform2f(state.uResolution, width, height);
        if (state.uDensity)
          gl.uniform1f(state.uDensity, r.density);
        if (state.uSize)
          gl.uniform1f(state.uSize, r.size);
        if (state.uRandomness)
          gl.uniform1f(state.uRandomness, r.randomness);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.useProgram(null);
      },
      cleanup: ({ gl, program, vao, vbo, texture }) => {
        gl.deleteBuffer(vbo);
        gl.deleteProgram(program);
        gl.deleteVertexArray(vao);
        gl.deleteTexture(texture);
      }
    })
  },
  schema: speckleSchema,
  validateParams: validateSpeckleParams
});


__webpack_require__.d(__webpack_exports__, {
}, {
  speckle: speckle
});


},

}]);
//# sourceMappingURL=2771.bundle.js.map