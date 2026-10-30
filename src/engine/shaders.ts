// ─────────────────────────────────────────────────────────────────────────────
// EIGHT MINUTES UNDER — post-processing shader pipeline (GLSL ES 1.00)
// Single fullscreen pass. The "3D" is a lie: photoreal 2D planes pushed
// through CRT curvature, VHS tracking damage, chromatic aberration,
// false-color thermal and a celluloid melt. The Reaper is never a sprite —
// he is a region of missing render data.
// ─────────────────────────────────────────────────────────────────────────────

export const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_SRC = `
precision highp float;

varying vec2 vUv;

uniform sampler2D u_scene;   // active feed (desk / cam0-3)
uniform sampler2D u_or;      // operating-room lights under the melt
uniform vec2  u_res;
uniform float u_time;        // global seconds
uniform float u_curve;       // CRT barrel curvature
uniform float u_zoom;
uniform vec2  u_zoomTarget;
uniform vec2  u_pan;
uniform float u_aberration;  // chromatic split amount
uniform float u_grain;       // crawling film grain
uniform float u_tear;        // horizontal tracking tears
uniform float u_scan;        // scanline strength
uniform float u_thermal;     // 0..1 false-color thermal (morgue)
uniform float u_melt;        // 0..1 celluloid burn progress
uniform float u_meltTime;    // seconds since melt began
uniform float u_staticMix;   // global static (booth feed / burned cam / endings)
uniform float u_whiteout;
uniform float u_dark;
uniform vec2  u_reaperPos;   // uv centre of the anomaly
uniform float u_reaperSize;
uniform float u_reaperAmt;   // 0..1 visibility
uniform float u_reaperVoid;  // 1 = absolute-zero void (thermal mode)
uniform float u_reaperFrozen;

// ── noise kit ────────────────────────────────────────────────────────────────
float hash12(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.1);
    a *= 0.5;
  }
  return v;
}

// ── the Reaper: a shifting hooded silhouette, pure SDF, never a sprite ──────
float reaperD(vec2 p, float t) {
  // the outline refuses to hold still
  p.x += sin(p.y * 5.0 + t * 1.7) * 0.06 + sin(p.y * 11.0 - t * 3.1) * 0.035;
  float head = length(p - vec2(0.0, 0.62)) - 0.22;
  float w = mix(0.12, 0.55, smoothstep(0.62, -1.1, p.y));
  float body = abs(p.x) - w;
  float shoulder = max(abs(p.x) - 0.42, abs(p.y - 0.42) - 0.16);
  return min(min(head, body), shoulder);
}

// ── false-color thermal palette: black → violet → red → orange → white ──────
vec3 thermalPal(float l) {
  vec3 c = mix(vec3(0.02, 0.0, 0.08), vec3(0.28, 0.03, 0.48), smoothstep(0.0, 0.3, l));
  c = mix(c, vec3(0.82, 0.1, 0.08), smoothstep(0.25, 0.55, l));
  c = mix(c, vec3(1.0, 0.55, 0.05), smoothstep(0.5, 0.75, l));
  c = mix(c, vec3(1.0, 0.97, 0.62), smoothstep(0.72, 0.95, l));
  return c;
}

void main() {
  float aspect = u_res.x / u_res.y;

  // ── CRT barrel curvature ──
  vec2 cc = vUv - 0.5;
  cc *= 1.0 + dot(cc, cc) * u_curve;
  vec2 suv = cc + 0.5;
  float edge = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);

  // ── diorama pan / digital zoom ──
  vec2 tuv = (suv - u_zoomTarget) / max(u_zoom, 0.001) + u_zoomTarget + u_pan;

  // ── horizontal tracking tears (degraded tape) ──
  float lineId = floor(suv.y * u_res.y / 3.0);
  float tearSeed = hash11(lineId * 1.31 + floor(u_time * 9.0));
  float tearBand = step(1.0 - u_tear * 0.30, tearSeed);
  tuv.x += tearBand * (hash11(lineId * 1.7 + floor(u_time * 23.0)) - 0.5) * 0.22 * u_tear;
  // slow vertical roll wobble
  tuv.y += sin(u_time * 0.6) * 0.0008 * u_tear;

  // ── chromatic aberration (radial split) ──
  vec2 rdir = suv - 0.5;
  vec2 roff = rdir * (u_aberration + 0.0015);
  float cr = texture2D(u_scene, tuv + roff).r;
  float cg = texture2D(u_scene, tuv).g;
  float cb = texture2D(u_scene, tuv - roff).b;
  vec3 col = vec3(cr, cg, cb);

  // ── false-color thermal (CAM 4 — the morgue) ──
  if (u_thermal > 0.001) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    l = l * 0.85 + fbm(tuv * vec2(aspect, 1.0) * 6.0 + vec2(u_time * 0.25, 0.0)) * 0.18;
    col = mix(col, thermalPal(l), u_thermal);
  }

  // ── THE REAPER: localized missing data ──
  if (u_reaperAmt > 0.001) {
    vec2 rp = suv - u_reaperPos;
    rp.x *= aspect;
    rp /= max(u_reaperSize, 0.001);
    float spd = (u_reaperFrozen > 0.5) ? 0.25 : 1.4;
    float d = reaperD(rp, u_time * spd);
    float rim = fbm(rp * 3.0 + vec2(u_time * 0.8, -u_time * 0.5)) * 0.2;
    float dd = d + rim;
    float mask = 1.0 - smoothstep(-0.03, 0.10, dd);
    mask *= u_reaperAmt;
    if (mask > 0.001) {
      vec3 corruption;
      if (u_reaperVoid > 0.5) {
        // absolute zero: a freezing void wiping the heat signature out
        float rimGlow = (1.0 - smoothstep(0.0, 0.12, dd)) * smoothstep(-0.10, -0.01, dd);
        corruption = vec3(0.10, 0.22, 0.55) * rimGlow * 0.8;
      } else {
        // intensified per-pixel static
        float st = hash12(vec2(floor(suv.x * u_res.x), floor(suv.y * u_res.y)) + floor(u_time * 30.0));
        st = step(0.35, st) * 1.25;
        // vertical pixel-sorting smear (columns dragged apart)
        float colSeed = hash11(floor(suv.x * u_res.x / 5.0) + floor(u_time * 7.0));
        vec2 suvSort = vec2(tuv.x, tuv.y + (colSeed - 0.5) * 0.35 * u_reaperAmt);
        vec3 sorted = vec3(
          texture2D(u_scene, suvSort + roff * 7.0).r,
          texture2D(u_scene, suvSort).g,
          texture2D(u_scene, suvSort - roff * 7.0).b
        );
        float flick = 0.55 + 0.3 * sin(u_time * 40.0 + rp.y * 20.0);
        corruption = mix(sorted, vec3(st), flick);
        corruption = mix(corruption, vec3(1.0, 0.06, 0.12) * st, 0.14);
      }
      col = mix(col, corruption, mask);
    }
  }

  // ── global static (booth feed while charging / burned cameras / endings) ──
  if (u_staticMix > 0.001) {
    float st = hash12(vec2(floor(suv.x * u_res.x * 0.5), floor(suv.y * u_res.y * 0.5)) + floor(u_time * 24.0));
    float band = vnoise(vec2(suv.y * 40.0, u_time * 9.0)) * 0.3;
    float rollbar = smoothstep(0.0, 0.06, abs(fract(suv.y * 0.35 - u_time * 0.11) - 0.5) - 0.44) * 0.25;
    vec3 stat = (vec3(st) * 0.85 + band + rollbar) * vec3(0.82, 1.0, 0.9);
    col = mix(col, stat, u_staticMix);
  }

  // ── celluloid melt: the game burns away, OR lights spin underneath ──
  if (u_melt > 0.001) {
    vec2 ouv = suv - 0.5;
    float a = u_meltTime * 0.4;
    float ca = cos(a);
    float sa = sin(a);
    ouv = mat2(ca, -sa, sa, ca) * ouv;
    float zs = 1.0 + sin(u_meltTime * 0.9) * 0.06 + u_melt * 0.25;
    ouv = ouv / zs + 0.5;
    vec3 orc = texture2D(u_or, ouv).rgb;
    orc = pow(orc, vec3(1.6)) * 1.35; // blinding, high-contrast
    float n = fbm(suv * vec2(aspect, 1.0) * 2.2 + vec2(0.0, u_meltTime * 0.04));
    float burnEdge = n + 0.35 - u_melt * 1.5;
    float hole = 1.0 - smoothstep(0.0, 0.12, burnEdge);
    float charr = smoothstep(0.0, 0.04, burnEdge) * (1.0 - smoothstep(0.04, 0.14, burnEdge));
    float ember = (1.0 - smoothstep(0.0, 0.09, burnEdge)) * smoothstep(-0.10, -0.01, burnEdge);
    col = mix(col, orc, hole);
    col = mix(col, vec3(0.03, 0.01, 0.0), charr * 0.85);
    col += vec3(1.0, 0.42, 0.06) * ember * (1.7 + 1.3 * sin(u_meltTime * 24.0 + n * 50.0));
  }

  // ── scanlines + travelling scan band ──
  float sl = sin(suv.y * u_res.y * 3.14159);
  col *= 1.0 - u_scan * (0.5 + 0.5 * sl) * 0.32;
  float band = 1.0 - smoothstep(0.0, 0.05, abs(fract(suv.y * 0.5 - u_time * 0.07) - 0.5) - 0.455);
  col += band * 0.035;

  // ── crawling film grain ──
  float gr = hash12(suv * u_res.xy + fract(u_time) * vec2(137.0, 91.0));
  col += (gr - 0.5) * u_grain;

  // ── vignette + phosphor tint ──
  float vig = clamp(1.0 - dot(cc, cc) * 1.35, 0.0, 1.0);
  col *= vig;
  col *= vec3(0.92, 1.0, 0.96);
  col *= 1.0 - u_dark;
  col = mix(col, vec3(1.0), clamp(u_whiteout, 0.0, 1.0));
  col *= edge;

  gl_FragColor = vec4(col, 1.0);
}
`;
