import { loadGLB } from './GLBLoader.js';

export async function loadDigimonModel(config, onProgress) {
  if (config.format !== 'glb' || !config.url) {
    throw new Error(`Formato de modelo não suportado: ${config.format ?? '—'}.`);
  }

  const gltf = await loadGLB(config.url, onProgress);
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}
