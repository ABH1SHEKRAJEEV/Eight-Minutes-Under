// ─────────────────────────────────────────────────────────────────────────────
// WebGL post renderer — one fullscreen triangle, one pass, all the damage.
// ─────────────────────────────────────────────────────────────────────────────
import { VERT_SRC, FRAG_SRC } from './shaders';

export interface FrameUniforms {
  scene: string;        // texture key to sample as the active feed
  time: number;
  curve: number;
  zoom: number;
  zoomTarget: [number, number];
  pan: [number, number];
  aberration: number;
  grain: number;
  tear: number;
  scan: number;
  thermal: number;
  melt: number;
  meltTime: number;
  staticMix: number;
  whiteout: number;
  dark: number;
  reaperPos: [number, number];
  reaperSize: number;
  reaperAmt: number;
  reaperVoid: number;
  reaperFrozen: number;
}

const UNIFORM_NAMES = [
  'u_scene', 'u_or', 'u_res', 'u_time', 'u_curve', 'u_zoom', 'u_zoomTarget',
  'u_pan', 'u_aberration', 'u_grain', 'u_tear', 'u_scan', 'u_thermal',
  'u_melt', 'u_meltTime', 'u_staticMix', 'u_whiteout', 'u_dark',
  'u_reaperPos', 'u_reaperSize', 'u_reaperAmt', 'u_reaperVoid', 'u_reaperFrozen',
] as const;

export class PostRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private textures: Record<string, WebGLTexture> = {};
  private w = 1;
  private h = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.prog = this.buildProgram(VERT_SRC, FRAG_SRC);
    gl.useProgram(this.prog);
    for (const n of UNIFORM_NAMES) this.loc[n] = gl.getUniformLocation(this.prog, n);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // fullscreen triangle
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1i(this.loc.u_scene, 0);
    gl.uniform1i(this.loc.u_or, 1);
    // 1×1 black fallback so we never sample an unbound unit
    this.textures.__black = this.makeSolidTexture(0, 0, 0);
  }

  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private makeSolidTexture(r: number, g: number, b: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
      new Uint8Array([r, g, b]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /** Load an image URL into a named texture slot (CLAMP, no mipmaps — NPOT safe). */
  loadTexture(key: string, url: string): Promise<void> {
    const gl = this.gl;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.textures[key] = tex;
        resolve();
      };
      img.onerror = () => reject(new Error('texture load failed: ' + url));
      img.src = url;
    });
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const cap = Math.min(dpr, 1.75); // 60fps budget: cap the fillrate
    const w = Math.max(2, Math.round(cssW * cap));
    const h = Math.max(2, Math.round(cssH * cap));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  render(u: FrameUniforms) {
    const gl = this.gl;
    const L = this.loc;
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[u.scene] ?? this.textures.__black);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.or ?? this.textures.__black);

    gl.uniform2f(L.u_res, this.w, this.h);
    gl.uniform1f(L.u_time, u.time);
    gl.uniform1f(L.u_curve, u.curve);
    gl.uniform1f(L.u_zoom, u.zoom);
    gl.uniform2f(L.u_zoomTarget, u.zoomTarget[0], u.zoomTarget[1]);
    gl.uniform2f(L.u_pan, u.pan[0], u.pan[1]);
    gl.uniform1f(L.u_aberration, u.aberration);
    gl.uniform1f(L.u_grain, u.grain);
    gl.uniform1f(L.u_tear, u.tear);
    gl.uniform1f(L.u_scan, u.scan);
    gl.uniform1f(L.u_thermal, u.thermal);
    gl.uniform1f(L.u_melt, u.melt);
    gl.uniform1f(L.u_meltTime, u.meltTime);
    gl.uniform1f(L.u_staticMix, u.staticMix);
    gl.uniform1f(L.u_whiteout, u.whiteout);
    gl.uniform1f(L.u_dark, u.dark);
    gl.uniform2f(L.u_reaperPos, u.reaperPos[0], u.reaperPos[1]);
    gl.uniform1f(L.u_reaperSize, u.reaperSize);
    gl.uniform1f(L.u_reaperAmt, u.reaperAmt);
    gl.uniform1f(L.u_reaperVoid, u.reaperVoid);
    gl.uniform1f(L.u_reaperFrozen, u.reaperFrozen);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
