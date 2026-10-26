import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

function splitPath(url) {
  const separator = url.lastIndexOf('/') + 1;
  return {
    basePath: url.slice(0, separator),
    fileName: url.slice(separator),
  };
}

function countMeshes(object) {
  let meshes = 0;

  object.traverse((child) => {
    if (child.isMesh) meshes += 1;
  });

  return meshes;
}

export async function loadOBJModel({ objUrl, mtlUrl }, onProgress) {
  if (!objUrl || !mtlUrl) {
    throw new Error('Os arquivos OBJ e MTL do Digimon não foram informados.');
  }

  const objPath = splitPath(objUrl);
  const mtlPath = splitPath(mtlUrl);

  const mtlLoader = new MTLLoader();
  mtlLoader.setPath(mtlPath.basePath || objPath.basePath);

  let materials;

  try {
    materials = await mtlLoader.loadAsync(mtlPath.fileName);
    materials.preload();
  } catch (error) {
    throw new Error(`Falha ao carregar o arquivo ${mtlPath.fileName}.`, {
      cause: error,
    });
  }

  if (Object.keys(materials.materialsInfo ?? {}).length === 0) {
    throw new Error(
      `O arquivo ${mtlPath.fileName} não contém materiais válidos.`,
    );
  }

  const objLoader = new OBJLoader();
  objLoader.setPath(objPath.basePath);
  objLoader.setMaterials(materials);

  let object;

  try {
    object = await objLoader.loadAsync(objPath.fileName, (event) => {
      if (!onProgress) return;
      const progress =
        event.total > 0 ? event.loaded / event.total : undefined;
      onProgress(progress, event);
    });
  } catch (error) {
    throw new Error(`Falha ao carregar o arquivo ${objPath.fileName}.`, {
      cause: error,
    });
  }

  if (!object || countMeshes(object) === 0) {
    throw new Error(`O arquivo ${objPath.fileName} não contém geometria.`);
  }

  return object;
}
