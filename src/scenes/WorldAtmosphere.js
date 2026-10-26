import * as THREE from 'three';
import { TAMER_PALETTE } from '../config/tamer.js';

function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 126);

  gradient.addColorStop(0, 'rgba(198, 235, 255, 0.62)');
  gradient.addColorStop(0.28, 'rgba(122, 190, 238, 0.28)');
  gradient.addColorStop(0.65, 'rgba(56, 121, 184, 0.1)');
  gradient.addColorStop(1, 'rgba(16, 49, 88, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default class WorldAtmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.clouds = [];
    this.stars = null;
    this.sky = null;

    scene.background = new THREE.Color(TAMER_PALETTE.fog);
    scene.fog = new THREE.FogExp2(TAMER_PALETTE.fog, 0.0115);

    this.createSky();
    this.createStars();
    this.createClouds();
    this.createGround();
    this.createLights();
  }

  createSky() {
    const geometry = new THREE.SphereGeometry(130, 48, 24);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(TAMER_PALETTE.skyTop) },
        horizonColor: { value: new THREE.Color(TAMER_PALETTE.skyHorizon) },
        bottomColor: { value: new THREE.Color(TAMER_PALETTE.fog) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float height = normalize(vWorldPosition).y;
          float horizonMix = smoothstep(-0.05, 0.42, height);
          float skyMix = smoothstep(0.3, 0.95, height);
          vec3 color = mix(bottomColor, horizonColor, horizonMix);
          color = mix(color, topColor, skyMix);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.sky = new THREE.Mesh(geometry, material);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    const haloGeometry = new THREE.TorusGeometry(22, 0.16, 8, 120);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: TAMER_PALETTE.cyan,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.set(-24, 31, -58);
    halo.rotation.set(1.08, 0.2, -0.36);
    this.scene.add(halo);

    const farHaloGeometry = new THREE.TorusGeometry(31, 0.08, 8, 120);
    const farHalo = new THREE.Mesh(farHaloGeometry, haloMaterial.clone());
    farHalo.material.color.set(TAMER_PALETTE.gold);
    farHalo.material.opacity = 0.1;
    farHalo.position.copy(halo.position);
    farHalo.rotation.set(1.12, -0.35, 0.15);
    this.scene.add(farHalo);
  }

  createStars() {
    const positions = [];
    const colors = [];
    const color = new THREE.Color();

    for (let index = 0; index < 620; index += 1) {
      const radius = THREE.MathUtils.randFloat(62, 118);
      const theta = Math.random() * Math.PI * 2;
      const height = THREE.MathUtils.randFloat(8, 78);
      positions.push(
        Math.cos(theta) * radius,
        height,
        Math.sin(theta) * radius,
      );
      color.set(Math.random() > 0.78 ? TAMER_PALETTE.gold : TAMER_PALETTE.cyan);
      color.lerp(new THREE.Color(0xffffff), Math.random() * 0.7);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.38,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(geometry, material);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  createClouds() {
    const texture = createCloudTexture();

    for (let index = 0; index < 9; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: index % 3 === 0 ? 0xa8dfff : 0x6db9ec,
        transparent: true,
        opacity: THREE.MathUtils.randFloat(0.08, 0.2),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const sprite = new THREE.Sprite(material);
      const angle = (index / 9) * Math.PI * 2 + Math.random() * 0.5;
      const radius = THREE.MathUtils.randFloat(48, 92);
      sprite.position.set(
        Math.cos(angle) * radius,
        THREE.MathUtils.randFloat(15, 34),
        Math.sin(angle) * radius - 12,
      );
      const scale = THREE.MathUtils.randFloat(22, 42);
      sprite.scale.set(scale, scale * 0.42, 1);
      this.clouds.push({
        sprite,
        baseX: sprite.position.x,
        speed: THREE.MathUtils.randFloat(0.08, 0.22),
        phase: Math.random() * Math.PI * 2,
      });
      this.scene.add(sprite);
    }
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({
        color: TAMER_PALETTE.deepBlue,
        roughness: 0.52,
        metalness: 0.48,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(
      200,
      100,
      TAMER_PALETTE.cyan,
      new THREE.Color(0x173a5a),
    );
    grid.position.y = 0.006;
    grid.material.transparent = true;
    grid.material.opacity = 0.1;
    grid.material.depthWrite = false;
    this.scene.add(grid);
  }

  createLights() {
    const hemisphere = new THREE.HemisphereLight(
      0x8fd9ff,
      0x071324,
      1.5,
    );
    this.scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0x1a4f80, 0.8);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xd8f1ff, 3.6);
    sun.position.set(18, 30, 4);
    sun.target.position.set(0, 0, 17);
    sun.castShadow = true;
    sun.shadow.mapSize.set(
      window.innerWidth < 800 ? 512 : 1024,
      window.innerWidth < 800 ? 512 : 1024,
    );
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 95;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun, sun.target);

    const rim = new THREE.DirectionalLight(0x3f9bff, 1.8);
    rim.position.set(-16, 10, -20);
    this.scene.add(rim);
  }

  update(delta, elapsed) {
    if (this.stars) {
      this.stars.rotation.y += delta * 0.003;
      this.stars.material.opacity = 0.62 + Math.sin(elapsed * 0.45) * 0.08;
    }

    for (const cloud of this.clouds) {
      cloud.sprite.position.x =
        cloud.baseX + Math.sin(elapsed * cloud.speed + cloud.phase) * 4.5;
    }
  }
}
