import { loadFBXModel } from './FBXModelLoader.js';
import { loadOBJModel } from './OBJModelLoader.js';

export function loadDigimonModel(config, onProgress) {
  if (config.format === 'fbx') {
    return loadFBXModel(config, onProgress);
  }

  if (config.format === 'obj') {
    return loadOBJModel(config, onProgress);
  }

  throw new Error(`Formato de modelo não suportado: ${config.format ?? '—'}.`);
}
