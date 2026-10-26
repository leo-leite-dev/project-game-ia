import {
  Color,
  LinearSRGBColorSpace,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';

export const PBR_SPECULAR_GLOSSINESS = 'KHR_materials_pbrSpecularGlossiness';

export default class GLTFPbrSpecularGlossiness {
  constructor(parser) {
    this.parser = parser;
    this.name = PBR_SPECULAR_GLOSSINESS;
  }

  getMaterialType(materialIndex) {
    const material = this.parser.json.materials?.[materialIndex];
    const extension = material?.extensions?.[PBR_SPECULAR_GLOSSINESS];
    return extension ? MeshStandardMaterial : null;
  }

  extendMaterialParams(materialIndex, materialParams) {
    const material = this.parser.json.materials?.[materialIndex];
    const extension = material?.extensions?.[PBR_SPECULAR_GLOSSINESS];

    if (!extension) return Promise.resolve();

    const pending = [];
    const diffuse = extension.diffuseFactor ?? [1, 1, 1, 1];

    materialParams.color = new Color().setRGB(
      diffuse[0],
      diffuse[1],
      diffuse[2],
      LinearSRGBColorSpace,
    );
    materialParams.opacity = diffuse[3] ?? 1;
    materialParams.metalness = 0.02;
    materialParams.roughness = extension.glossinessFactor !== undefined
      ? Math.min(0.95, Math.max(0.12, 1 - extension.glossinessFactor))
      : 0.7;

    if (extension.diffuseTexture !== undefined) {
      pending.push(
        this.parser.assignTexture(
          materialParams,
          'map',
          extension.diffuseTexture,
          SRGBColorSpace,
        ),
      );
    }

    return Promise.all(pending);
  }
}
