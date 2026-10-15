import { RIPPLE_LIMIT } from "./fork-home-ripples";

export const VERTEX_SHADER = `#version 300 es
void main() {
	vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const NOISE = `
float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
		mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
	float value = 0.0;
	float amplitude = 0.5;
	for (int octave = 0; octave < 3; octave++) {
		value += amplitude * noise(p);
		p = p * 2.03 + vec2(17.1, 9.2);
		amplitude *= 0.5;
	}
	return value / 0.875;
}`;

export const FIELD_SHADER = `#version 300 es
precision highp float;
uniform vec2 uCell;
uniform vec2 uSize;
uniform float uTime;
uniform vec4 uLogo;
uniform sampler2D uLogoMask;
uniform int uCount;
uniform vec4 uRipples[${RIPPLE_LIMIT}];
out vec4 outField;
${NOISE}

float wobble(float angle, float seed, float age) {
	return 0.5 * sin(3.0 * angle + seed * 1.7)
		+ 0.3 * sin(5.0 * angle + seed * 2.3)
		+ 0.2 * sin(8.0 * angle + seed * 3.1 + age * 1.5);
}

void main() {
	vec2 p = (floor(gl_FragCoord.xy) + 0.5) * uCell;
	vec2 logoUv = (p - uLogo.xy) / uLogo.zw;
	vec2 mask = all(greaterThanEqual(logoUv, vec2(0.0))) && all(lessThanEqual(logoUv, vec2(1.0)))
		? texture(uLogoMask, logoUv).rg
		: vec2(0.0);
	float logo = step(0.5, mask.r);
	vec2 center = (p - vec2(uSize.x * 0.5, uSize.y * 0.45)) / vec2(min(450.0, uSize.x * 0.28), uSize.y * 0.75);
	float quiet = 1.0 - exp(-(pow(center.x, 4.0) + pow(center.y, 4.0)) * 1.5) * 0.6;

	float drift = 0.0;
	float energy = 0.0;
	float crest = 0.0;
	for (int index = 0; index < ${RIPPLE_LIMIT}; index++) {
		if (index >= uCount) break;
		vec4 ripple = uRipples[index];
		vec2 d = p - ripple.xy;
		float age = max(ripple.z, 0.0);
		float seed = ripple.w;
		float angle = atan(d.y, d.x);
		if (seed < 0.0) {
			float radius = 12.0 + 70.0 * pow(age, 0.9);
			float offset = (length(d) + wobble(angle, seed, age * 0.3) * (14.0 + radius * 0.3) - radius) / (26.0 + radius * 0.3);
			float shape = smoothstep(0.26, 0.66, fbm(d * 0.011 + vec2(seed * 7.1, seed * 3.3) + age * 0.05));
			drift += exp(-offset * offset) * shape * smoothstep(0.0, 1.2, age) * exp(-age / 3.2) * (1.0 - smoothstep(6.0, 8.6, age));
			continue;
		}
		float radius = 360.0 * pow(age, 0.8);
		float offset = (length(d) + wobble(angle, seed, age) * (10.0 + radius * 0.14) - radius) / (16.0 + radius * 0.035);
		float front = exp(-offset * offset);
		float tail = offset < 0.0 ? 0.4 * exp(offset * 0.45) * pow(0.5 - 0.5 * cos(offset * 2.4), 3.0) : 0.0;
		float breakup = 0.55 + 0.45 * sin(d.x * 0.043 + seed * 2.3) * sin(d.y * 0.057 + seed * 1.7);
		float fade = exp(-age / 1.5) * min(1.0, age * 12.0) * (1.0 - smoothstep(1.6, 3.9, age));
		energy += (front + tail) * breakup * fade;
		crest += front * breakup * fade;
	}
	float grain = 0.75 + 0.25 * noise(p * 0.08 + uTime * 0.6);
	float clear = 1.0 - mask.g * 0.85 * (1.0 - logo);
	drift = min(1.0, drift * quiet * clear * (1.0 - logo));
	energy = 1.0 - exp(-1.5 * energy * grain * mix(0.55 + 0.45 * quiet, 1.0, logo) * clear);
	outField = vec4(drift, energy, clamp(crest / max(energy, 0.001), 0.0, 1.0), logo);
}`;

export const COMPOSE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform sampler2D uAtlas;
uniform ivec2 uCellPixels;
uniform float uHeight;
uniform float uTime;
uniform int uGlyphs;
uniform int uLogoGlyphs[10];
uniform float uLogoRest;
uniform float uDriftAlpha;
uniform vec3 uInk;
uniform vec3 uEmber;
uniform vec3 uCrest;
out vec4 outColor;
${NOISE}

void main() {
	ivec2 pixel = ivec2(int(gl_FragCoord.x), int(uHeight - gl_FragCoord.y));
	ivec2 cell = pixel / uCellPixels;
	ivec2 local = pixel - cell * uCellPixels;
	vec4 field = texelFetch(uField, cell, 0);
	vec2 id = vec2(cell);
	bool logo = field.a > 0.5;
	int glyph;
	if (logo) {
		glyph = uLogoGlyphs[(cell.x + cell.y * 3) % 10];
	} else {
		float roll = floor(uTime * (0.04 + field.g * 7.0) + hash(id) * 13.0);
		glyph = int(hash(id + roll * 0.37) * float(uGlyphs));
	}
	float ink = texelFetch(uAtlas, ivec2(glyph * uCellPixels.x + local.x, local.y), 0).a;
	vec3 hot = mix(uEmber, uCrest, field.b * smoothstep(0.25, 0.7, field.g));
	vec3 color = mix(uInk, hot, smoothstep(0.0, 0.12, field.g));
	float alpha = ink * min(1.0, field.r * uDriftAlpha + field.g * 1.9);
	if (logo) {
		float lit = smoothstep(0.05, 0.14, field.g);
		hot = uEmber;
		color = mix(uInk, uEmber, lit);
		alpha = ink * mix(uLogoRest, 1.0, lit);
	}
	vec2 uv = (vec2(pixel) + 0.5) / vec2(uCellPixels * textureSize(uField, 0));
	vec4 blurred = texture(uField, uv);
	float haze = pow(blurred.g * blurred.b, 2.0) * 0.035;
	outColor = vec4(color * alpha + hot * haze * (1.0 - alpha), alpha + haze * (1.0 - alpha));
}`;
