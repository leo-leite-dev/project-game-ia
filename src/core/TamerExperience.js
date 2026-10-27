import * as THREE from 'three';
import TamerCameraRig from '../camera/TamerCameraRig.js';
import { DIGIMONS } from '../config/digimons.js';
import {
  CREATION,
  DIGIMON_MODELS,
  PEDESTALS,
  ROOM,
  TRANSITION,
} from '../config/tamer.js';
import Tamer from '../entities/Tamer.js';
import { loadDigimonModel } from '../loaders/DigimonModelLoader.js';
import WorldAtmosphere from '../scenes/WorldAtmosphere.js';
import CreationStage from '../scenes/CreationStage.js';
import DigimonRoom from '../scenes/DigimonRoom.js';
import { loadTamer, saveTamer } from '../services/tamerStorage.js';
import TamerUI from '../ui/TamerUI.js';

const smoothstep = (edge0, edge1, value) => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export default class TamerExperience {
  constructor(container) {
    this.container = container;
    this.state = 'loading';
    this.savedTamer = null;
    this.transitionElapsed = 0;
    this.runStarted = false;
    this.runEnded = false;
    this.roomShown = false;
    this.activePedestalIndex = 0;
    this.digimonLoads = new Map();
    this.pointerStart = new THREE.Vector2();
    this.pointerStartTime = 0;
    this.pointerNdc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CREATION.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      220,
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, window.innerWidth < 900 ? 1.25 : 1.5),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    this.atmosphere = new WorldAtmosphere(this.scene, this.renderer);
    this.stage = new CreationStage(this.scene);
    this.room = new DigimonRoom(this.scene);
    this.tamer = new Tamer();
    this.tamer.setPosition(0, CREATION.platformY, 0);
    this.scene.add(this.tamer.group);

    this.cameraRig = new TamerCameraRig({
      camera: this.camera,
      domElement: this.renderer.domElement,
    });

    this.ui = new TamerUI({
      onSubmit: (name) => this.confirmName(name),
      onContinue: (tamer) => this.continueTamer(tamer),
      onSelectPedestal: (index) => this.selectPedestal(index),
      onStepPedestal: (direction) => this.stepPedestal(direction),
    });

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.elapsed = 0;
    this.onResize = this.onResize.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.renderer.setAnimationLoop(this.animate);
    this.load();
  }

  async load() {
    this.ui.setLoadingProgress(0, 'SINCRONIZANDO TAMER');

    try {
      const result = await this.tamer.load((progress) => {
        this.ui.setLoadingProgress(progress, 'CARREGANDO TAMER');
      });

      this.ui.setLoadingProgress(1, 'TAMER PRONTO');
      this.cameraRig.enableCreation();
      this.state = 'creation';

      this.savedTamer = loadTamer();
      this.ui.setReady({ savedTamer: this.savedTamer });
      this.startDigimonLoads();

      if (result.usingFallback) {
        this.ui.showModelFallback(
          'Não foi possível carregar o Tamer 3D. Usando um visual provisório.',
        );
      }
    } catch (error) {
      console.error('Falha ao iniciar a criação do Tamer:', error);
      this.cameraRig.enableCreation();
      this.state = 'creation';
      this.ui.finishLoading();
      this.ui.showToast('Falha ao iniciar a experiência 3D.', {
        error: true,
        duration: 6000,
      });
    }
  }

  startDigimonLoads() {
    for (let index = 0; index < PEDESTALS.length; index += 1) {
      const pedestal = PEDESTALS[index];
      if (!pedestal.digimonId || this.digimonLoads.has(index)) continue;

      this.digimonLoads.set(index, this.loadDigimon(index));
    }
  }

  async loadDigimon(index) {
    const pedestal = PEDESTALS[index];
    const digimon = DIGIMONS[pedestal.digimonId] ?? null;
    const modelConfig = DIGIMON_MODELS[pedestal.digimonId] ?? null;

    if (!digimon || !modelConfig) {
      this.digimonLoads.delete(index);
      return null;
    }

    const fileName = modelConfig.url.slice(modelConfig.url.lastIndexOf('/') + 1);

    try {
      const object = await loadDigimonModel(modelConfig);

      this.room.addDigimonModel(index, object, {
        height: modelConfig.height,
        rotationY: modelConfig.rotationY,
        idleClipName: modelConfig.idleClipName,
      });

      return { index, digimon };
    } catch (error) {
      console.error(
        `Falha ao carregar o modelo de ${digimon.name} (${fileName}):`,
        error,
      );
      this.digimonLoads.delete(index);
      this.ui.showToast(
        `Falha ao carregar ${digimon.name} (${fileName}): ${error.message}`,
        { error: true, duration: 7000 },
      );
      return null;
    }
  }

  selectPedestal(index, { immediate = false } = {}) {
    const total = PEDESTALS.length;
    const safeIndex = THREE.MathUtils.clamp(index, 0, total - 1);
    const config = PEDESTALS[safeIndex];
    const digimon = config.digimonId
      ? (DIGIMONS[config.digimonId] ?? null)
      : null;

    this.activePedestalIndex = safeIndex;
    this.room.setActivePedestal(safeIndex, { immediate });
    this.ui.showPedestal({
      index: safeIndex,
      total,
      number: config.number,
      digimon,
    });
  }

  stepPedestal(direction) {
    const total = PEDESTALS.length;
    const nextIndex =
      (this.activePedestalIndex + direction + total) % total;
    this.selectPedestal(nextIndex);
  }

  pickPedestal(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.room.pickPedestal(this.raycaster);
  }

  handlePointerDown(event) {
    if (this.state !== 'room') return;
    this.pointerStart.set(event.clientX, event.clientY);
    this.pointerStartTime = performance.now();
  }

  handlePointerMove(event) {
    if (this.state !== 'room') return;

    const index = this.pickPedestal(event.clientX, event.clientY);
    this.room.setHoveredPedestal(index);
    this.renderer.domElement.style.cursor =
      index >= 0 ? 'pointer' : 'default';
  }

  handlePointerUp(event) {
    if (this.state !== 'room') return;

    const deltaX = event.clientX - this.pointerStart.x;
    const deltaY = event.clientY - this.pointerStart.y;
    const distance = Math.hypot(deltaX, deltaY);
    const duration = performance.now() - this.pointerStartTime;

    if (Math.abs(deltaX) > 44 && Math.abs(deltaX) > Math.abs(deltaY)) {
      this.stepPedestal(deltaX < 0 ? 1 : -1);
      return;
    }

    if (distance > 10 || duration > 700) return;

    const index = this.pickPedestal(event.clientX, event.clientY);
    if (index >= 0) {
      this.selectPedestal(index);
    }
  }

  handlePointerLeave() {
    this.room.setHoveredPedestal(-1);
    this.renderer.domElement.style.cursor = 'default';
  }

  confirmName(name) {
    let tamer;

    try {
      tamer = saveTamer(name);
    } catch (error) {
      console.error('Falha ao salvar o Tamer:', error);
      tamer = { name };
      this.ui.showToast(
        'Não foi possível salvar o Tamer neste navegador.',
        { error: true, duration: 5200 },
      );
    }

    this.startTransition(tamer);
  }

  continueTamer(tamer) {
    if (!tamer) return;
    this.startTransition(tamer);
  }

  startTransition(tamer) {
    if (this.state !== 'creation') return;

    this.state = 'transition';
    this.savedTamer = tamer;
    this.transitionElapsed = 0;
    this.runStarted = false;
    this.runEnded = false;
    this.roomShown = false;
    this.activePedestalIndex = 0;

    this.selectPedestal(0, { immediate: true });
    this.startDigimonLoads();
    this.tamer.setPosition(0, CREATION.platformY, 0);
    this.tamer.group.rotation.set(0, 0, 0);
    this.tamer.playIdle();
    this.cameraRig.startTransition();

    this.ui.beginTransition({
      title: 'TAMER CONFIRMADO',
      name: tamer.name,
      note: 'Abrindo a sala dos Digimons...',
    });
  }

  updateTransition(delta) {
    this.transitionElapsed += delta;
    const elapsed = this.transitionElapsed;
    const progress = Math.min(elapsed / TRANSITION.duration, 1);
    const runProgress = smoothstep(
      TRANSITION.runStart,
      TRANSITION.runEnd,
      elapsed,
    );

    this.tamer.setPosition(
      THREE.MathUtils.lerp(0, ROOM.tamerX, runProgress),
      CREATION.platformY,
      THREE.MathUtils.lerp(0, ROOM.tamerZ, runProgress),
    );

    if (!this.runStarted && elapsed >= TRANSITION.runStart) {
      this.tamer.playRun();
      this.runStarted = true;
    }

    if (!this.runEnded && elapsed >= TRANSITION.runEnd) {
      this.tamer.playIdle();
      this.runEnded = true;
    }

    this.cameraRig.updateTransition(progress, this.tamer.getPosition());

    if (!this.roomShown && elapsed >= TRANSITION.roomReveal) {
      this.ui.showRoom(this.savedTamer.name);
      this.roomShown = true;
      document.title = 'game-ia — Sala dos Digimons';
    }

    if (elapsed >= TRANSITION.duration) {
      this.finishTransition();
    }
  }

  finishTransition() {
    this.state = 'room';
    this.cameraRig.enterRoom();
    this.tamer.setPosition(ROOM.tamerX, CREATION.platformY, ROOM.tamerZ);
    this.tamer.group.rotation.y = 0.34;
    this.tamer.playIdle();

    if (!this.roomShown) {
      this.ui.showRoom(this.savedTamer.name);
      this.roomShown = true;
    }
  }

  animate() {
    this.timer.update();
    const rawDelta = this.timer.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    this.elapsed += rawDelta;
    const elapsed = this.elapsed;

    this.tamer.update(delta, elapsed);
    this.stage.update(delta, elapsed);
    this.room.update(delta, elapsed);
    this.atmosphere.update(delta, elapsed);

    if (this.state === 'creation') {
      this.cameraRig.update(delta, elapsed);
    } else if (this.state === 'transition') {
      this.updateTransition(rawDelta);
    } else if (this.state === 'room') {
      this.cameraRig.updateRoom(delta, elapsed);
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, width < 900 ? 1.25 : 1.5),
    );
    this.renderer.setSize(width, height, false);
  }
}
