import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

function splitPath(url) {
  const separator = url.lastIndexOf('/') + 1;
  return {
    basePath: url.slice(0, separator),
    fileName: url.slice(separator),
  };
}

async function loadTexture(url) {
  const { fileName } = splitPath(url);

  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.name = fileName;
    return texture;
  } catch (error) {
    throw new Error(`Falha ao carregar a textura ${fileName}.`, {
      cause: error,
    });
  }
}

export async function loadFBXModel(
  { fbxUrl, textures = {} },
  onProgress,
) {
  if (!fbxUrl) {
    throw new Error('O arquivo FBX do Digimon não foi informado.');
  }

  const fbxPath = splitPath(fbxUrl);
  const fbxLoader = new FBXLoader();
  fbxLoader.setPath(fbxPath.basePath);
  fbxLoader.setResourcePath(fbxPath.basePath);

  let object;

  try {
    object = await fbxLoader.loadAsync(fbxPath.fileName, (event) => {
      if (!onProgress) return;
      const progress =
        event.total > 0 ? event.loaded / event.total : undefined;
      onProgress(progress, event);
    });
  } catch (error) {
    throw new Error(`Falha ao carregar o arquivo ${fbxPath.fileName}.`, {
      cause: error,
    });
  }

  let meshCount = 0;
  object?.traverse((child) => {
    if (child.isMesh) meshCount += 1;
  });

  if (meshCount === 0) {
    throw new Error(`O arquivo ${fbxPath.fileName} não contém geometria.`);
  }

  const textureEntries = Object.entries(textures);
  const loadedTextures = new Map(
    await Promise.all(
      textureEntries.map(async ([materialName, url]) => [
        materialName,
        await loadTexture(url),
      ]),
    ),
  );

  object.traverse((child) => {
    if (!child.isMesh) return;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      if (!material) continue;

      const map = loadedTextures.get(material.name);
      if (!map) continue;

      material.map = map;
      material.color?.set(0xffffff);
      material.needsUpdate = true;
    }
  });

  return object;
}
