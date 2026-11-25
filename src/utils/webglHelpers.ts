import * as THREE from 'three';

export function detectSoftwareWebGL(): { supported: boolean; isSoftwareGl: boolean } {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftwareGl: false };
  }
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    return { supported: false, isSoftwareGl: false };
  }

  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    gpu = '';
  }

  const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
    gpu
  );
  return { supported: true, isSoftwareGl };
}

export function disposeMaterialTextures(material: THREE.Material): void {
  const mat = material as unknown as Record<string, unknown>;
  const textureKeys = [
    'map',
    'bumpMap',
    'roughnessMap',
    'metalnessMap',
    'normalMap',
    'emissiveMap',
    'alphaMap',
    'aoMap',
    'clearcoatMap',
  ];
  for (const key of textureKeys) {
    const tex = mat[key];
    if (tex instanceof THREE.Texture) {
      tex.dispose();
    }
  }
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          disposeMaterialTextures(m);
          m.dispose();
        });
      } else if (obj.material) {
        disposeMaterialTextures(obj.material);
        obj.material.dispose();
      }
    }
  });
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 122);
    grad.addColorStop(0, 'rgba(34, 27, 21, 0.42)');
    grad.addColorStop(0.5, 'rgba(34, 27, 21, 0.16)');
    grad.addColorStop(1, 'rgba(34, 27, 21, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLeatheretteBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    // Deterministic pseudo-random pebble grain
    let seed = 4219;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 1600; i++) {
      const x = nextRand() * 128;
      const y = nextRand() * 128;
      const r = 0.8 + nextRand() * 1.4;
      const shade = Math.floor(85 + nextRand() * 95);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 3);
  return tex;
}

export function createKnurledBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let x = 0; x < 256; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? '#d8d8d8' : '#404040';
      ctx.fillRect(x, 0, 2, 64);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

export function createShutterDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e1915';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#c8bca6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 128, 114, 0, Math.PI * 2);
    ctx.stroke();

    const speeds = ['1000', '500', '250', '125', '60', '30', '15', 'B'];
    ctx.font = 'bold 20px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    speeds.forEach((label, idx) => {
      const angle = (idx / speeds.length) * Math.PI * 2 - Math.PI / 2;
      const tx = 128 + Math.cos(angle) * 80;
      const ty = 128 + Math.sin(angle) * 80;
      ctx.fillStyle = label === 'B' ? '#b84a27' : '#f4ecd8';
      ctx.fillText(label, tx, ty);
    });

    ctx.fillStyle = '#b84a27';
    ctx.beginPath();
    ctx.arc(128, 128, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createFilmCanisterLabelTexture(
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Classic warm amber/kodachrome film canister label
    ctx.fillStyle = '#d99b26';
    ctx.fillRect(0, 0, 512, 256);

    // Top & bottom dark charcoal bands
    ctx.fillStyle = '#221b15';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillRect(0, 222, 512, 34);

    // Terracotta accent stripe
    ctx.fillStyle = '#b84a27';
    ctx.fillRect(0, 178, 512, 44);

    ctx.fillStyle = '#221b15';
    ctx.font = 'bold 42px Georgia, serif';
    ctx.fillText('MARSEL 400', 34, 112);

    ctx.font = 'bold 22px "IBM Plex Mono", monospace';
    ctx.fillText('35MM · 36 EXP · DX', 36, 152);

    ctx.fillStyle = '#f8f3e6';
    ctx.font = 'bold 20px "IBM Plex Mono", monospace';
    ctx.fillText('FINE ART ARCHIVAL FILM', 36, 207);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
