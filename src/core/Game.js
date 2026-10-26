import * as THREE from 'three';
import ThirdPersonCamera from '../camera/ThirdPersonCamera.js';
import { COLORS, PLAYER, WORLD } from '../config/constants.js';
import Player from '../entities/Player.js';
import InputController from '../input/InputController.js';

export default class Game {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WORLD.skyColor);
    this.scene.fog = new THREE.Fog(WORLD.skyColor, WORLD.fogNear, WORLD.fogFar);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 250);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    this.createLights();
    this.createGround();
    this.createRocks();

    this.player = new Player(this.scene);
    this.thirdPersonCamera = new ThirdPersonCamera(
      this.camera,
      this.player.root
    );
    this.input = new InputController();
    this.modelStatus = document.querySelector('#model-status');

    this.moveDirection = new THREE.Vector3();
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this.onResize = this.onResize.bind(this);
    this.update = this.update.bind(this);

    window.addEventListener('resize', this.onResize);
    this.onResize();

    this.renderer.setAnimationLoop(this.update);
    this.loadPlayerModel();
  }

  async loadPlayerModel() {
    try {
      await this.player.loadModel(PLAYER.modelUrl);

      if (this.modelStatus) {
        this.modelStatus.hidden = true;
      }
    } catch (error) {
      console.error('Falha ao carregar o modelo GLB:', error);

      if (this.modelStatus) {
        this.modelStatus.hidden = false;
        this.modelStatus.textContent =
          'Falha ao carregar o modelo. Usando personagem provisório.';
        this.modelStatus.classList.add('is-error');
      }
    }
  }

  createLights() {
    const hemisphere = new THREE.HemisphereLight(0xdcecff, 0x3a4a3a, 1.4);
    this.scene.add(hemisphere);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -24;
    this.sun.shadow.camera.right = 24;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -24;
    this.sun.shadow.bias = -0.0004;

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.updateSunPosition();
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.groundSize, WORLD.groundSize),
      new THREE.MeshStandardMaterial({
        color: COLORS.ground,
        roughness: 0.95,
        metalness: 0,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(
      WORLD.groundSize,
      WORLD.groundSize / 2,
      COLORS.grid,
      COLORS.grid
    );
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.material.depthWrite = false;
    this.scene.add(grid);
  }

  createRocks() {
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({
      color: COLORS.rock,
      roughness: 1,
      flatShading: true,
    });

    const rocks = [
      [7, 5, 1.1],
      [-9, 7, 0.8],
      [5, -10, 1.5],
      [-12, -7, 1],
      [14, -3, 0.7],
      [-5, 14, 1.3],
      [10, 13, 0.9],
      [-16, 12, 1.1],
    ];

    rocks.forEach(([x, z, scale], index) => {
      const rock = new THREE.Mesh(geometry, material);
      rock.scale.set(scale, scale * 0.8, scale);
      rock.position.set(x, scale * 0.45, z);
      rock.rotation.y = index * 1.7;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    });
  }

  updateSunPosition() {
    const position = this.player ? this.player.root.position : { x: 0, z: 0 };

    this.sun.position.set(position.x + 12, 22, position.z + 10);
    this.sun.target.position.set(position.x, 0, position.z);
    this.sun.target.updateMatrixWorld();
  }

  update() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const input = this.input.getMovement();

    this.moveDirection.set(0, 0, 0);
    this.moveDirection.addScaledVector(
      this.thirdPersonCamera.getRight(),
      input.x
    );
    this.moveDirection.addScaledVector(
      this.thirdPersonCamera.getForward(),
      input.z
    );

    if (this.moveDirection.lengthSq() > 0) {
      this.moveDirection.normalize();
    }

    this.player.update(dt, this.moveDirection);
    this.thirdPersonCamera.update(dt);
    this.updateSunPosition();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  }
}
