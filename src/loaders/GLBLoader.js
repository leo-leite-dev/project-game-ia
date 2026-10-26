import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GLTFPbrSpecularGlossiness from './GLTFPbrSpecularGlossiness.js';

const loader = new GLTFLoader();
loader.register((parser) => new GLTFPbrSpecularGlossiness(parser));

export function loadGLB(url, onProgress) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      (event) => {
        if (!onProgress) return;

        const progress =
          event.total > 0 ? event.loaded / event.total : undefined;
        onProgress(progress, event);
      },
      reject,
    );
  });
}
