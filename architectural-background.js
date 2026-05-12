import * as THREE from "./three.module.min.js";

const canvas = document.querySelector("#architectural-bg");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

if (canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });

  renderer.setClearColor(0xffffff, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 9.5);

  const root = new THREE.Group();
  const lattice = new THREE.Group();
  root.add(lattice);
  scene.add(root);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
  const keyLight = new THREE.DirectionalLight(0xf7fbff, 2.3);
  keyLight.position.set(2.8, 3.4, 5);
  scene.add(ambientLight, keyLight);

  const shapeGeometries = {
    block: new THREE.BoxGeometry(0.9, 0.9, 0.9),
    module: new THREE.BoxGeometry(1.1, 0.18, 0.72),
    column: new THREE.CylinderGeometry(0.32, 0.32, 1.18, 6),
    pyramid: new THREE.ConeGeometry(0.62, 1.1, 4),
    node: new THREE.IcosahedronGeometry(0.58, 1),
    ring: new THREE.TorusGeometry(0.46, 0.065, 12, 42),
  };

  const blue = 0x05a1b2;
  const graphite = 0x2c3e50;
  const coral = 0xff6b6b;
  const gold = 0xe7b10a;
  const mint = 0x35c2a1;

  const nodes = [
    { type: "block", position: [-3.1, 1.05, -0.35], color: blue, scale: 0.92 },
    { type: "module", position: [-1.78, 1.82, 0.5], color: graphite, scale: 0.9 },
    { type: "node", position: [-0.6, 0.95, -0.1], color: mint, scale: 0.82 },
    { type: "column", position: [0.8, 1.58, 0.3], color: blue, scale: 0.84 },
    { type: "pyramid", position: [2.36, 0.88, -0.18], color: coral, scale: 0.86 },
    { type: "ring", position: [3.18, 1.92, 0.46], color: gold, scale: 0.9 },
    { type: "module", position: [-2.68, -0.42, 0.4], color: gold, scale: 0.84 },
    { type: "column", position: [-1.1, -1.06, -0.36], color: coral, scale: 0.86 },
    { type: "block", position: [0.28, -0.35, 0.52], color: graphite, scale: 0.88 },
    { type: "node", position: [1.62, -1.22, -0.24], color: blue, scale: 0.8 },
    { type: "module", position: [2.88, -0.28, 0.34], color: mint, scale: 0.88 },
    { type: "pyramid", position: [-0.05, -2.08, 0.12], color: gold, scale: 0.76 },
  ];

  const connections = [
    [0, 1],
    [0, 6],
    [1, 2],
    [1, 6],
    [2, 3],
    [2, 8],
    [3, 4],
    [3, 8],
    [4, 5],
    [4, 10],
    [6, 7],
    [7, 8],
    [7, 11],
    [8, 9],
    [8, 11],
    [9, 10],
    [9, 11],
    [2, 7],
    [3, 10],
  ];

  const shapeMeshes = nodes.map((node, index) => {
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.13,
      roughness: 0.36,
      metalness: 0.08,
      emissive: node.color,
      emissiveIntensity: 0.025,
      depthWrite: false,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.42,
    });
    const mesh = new THREE.Mesh(shapeGeometries[node.type], baseMaterial);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(shapeGeometries[node.type]),
      edgeMaterial,
    );

    mesh.add(edges);
    mesh.position.fromArray(node.position);
    mesh.scale.setScalar(node.scale);
    mesh.rotation.set(index * 0.22, index * 0.17, index * 0.11);
    mesh.userData = {
      basePosition: new THREE.Vector3().fromArray(node.position),
      baseScale: node.scale,
      edgeMaterial,
      phase: index * 0.73,
      hover: 0,
      spin: 0.0035 + index * 0.00035,
    };
    lattice.add(mesh);

    return mesh;
  });

  const dotPositions = new Float32Array(nodes.length * 3);
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute("position", new THREE.BufferAttribute(dotPositions, 3));
  const dots = new THREE.Points(
    dotGeometry,
    new THREE.PointsMaterial({
      color: graphite,
      size: 0.105,
      transparent: true,
      opacity: 0.58,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
  lattice.add(dots);

  const linePositions = new Float32Array(connections.length * 6);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const connectionLines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      color: 0x7daeb8,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  lattice.add(connectionLines);

  const hoverHalo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.96, 1),
    new THREE.MeshBasicMaterial({
      color: blue,
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false,
    }),
  );
  hoverHalo.visible = false;
  lattice.add(hoverHalo);

  const grid = new THREE.GridHelper(8.8, 16, 0xaed4dc, 0xe6f0f2);
  grid.position.set(0.15, -2.86, -0.72);
  grid.rotation.x = Math.PI / 2;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.16;
    material.depthWrite = false;
  });
  lattice.add(grid);

  const raycaster = new THREE.Raycaster();
  const rayPointer = new THREE.Vector2();
  const projectedPosition = new THREE.Vector3();
  let hoveredMesh = null;

  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    clientX: window.innerWidth / 2,
    clientY: window.innerHeight / 2,
    active: false,
  };

  const setPointerFromEvent = (event) => {
    pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.targetY = -(event.clientY / window.innerHeight - 0.5) * 2;
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    pointer.active = true;
  };

  const resetPointer = () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
    pointer.active = false;
    hoveredMesh = null;
  };

  window.addEventListener("pointermove", setPointerFromEvent, { passive: true });
  window.addEventListener("pointerleave", resetPointer);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const compact = width < 680;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = compact ? 9.3 : 8.15;
    camera.updateProjectionMatrix();

    const scale = compact ? 0.88 : 1.18;
    root.scale.setScalar(scale);
    root.position.set(compact ? 0 : 0.24, compact ? 0.18 : 0.08, 0);
  };

  const updateConnectors = () => {
    shapeMeshes.forEach((mesh, index) => {
      const offset = index * 3;
      dotPositions[offset] = mesh.position.x;
      dotPositions[offset + 1] = mesh.position.y;
      dotPositions[offset + 2] = mesh.position.z;
    });

    connections.forEach(([from, to], index) => {
      const positionOffset = index * 6;
      const fromPosition = shapeMeshes[from].position;
      const toPosition = shapeMeshes[to].position;

      linePositions[positionOffset] = fromPosition.x;
      linePositions[positionOffset + 1] = fromPosition.y;
      linePositions[positionOffset + 2] = fromPosition.z;
      linePositions[positionOffset + 3] = toPosition.x;
      linePositions[positionOffset + 4] = toPosition.y;
      linePositions[positionOffset + 5] = toPosition.z;
    });

    dotGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.position.needsUpdate = true;
  };

  window.addEventListener("resize", resize);
  resize();
  updateConnectors();

  const findHoveredMesh = () => {
    if (!pointer.active) {
      return null;
    }

    rayPointer.set(pointer.targetX, pointer.targetY);
    raycaster.setFromCamera(rayPointer, camera);

    const [intersectedShape] = raycaster.intersectObjects(shapeMeshes, false);
    if (intersectedShape) {
      return intersectedShape.object;
    }

    const hitRadius = window.innerWidth < 680 ? 76 : 92;
    let closestMesh = null;
    let closestDistance = hitRadius;

    shapeMeshes.forEach((mesh) => {
      mesh.getWorldPosition(projectedPosition);
      projectedPosition.project(camera);

      if (projectedPosition.z < -1 || projectedPosition.z > 1) {
        return;
      }

      const screenX = (projectedPosition.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-projectedPosition.y * 0.5 + 0.5) * window.innerHeight;
      const distance = Math.hypot(screenX - pointer.clientX, screenY - pointer.clientY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestMesh = mesh;
      }
    });

    return closestMesh;
  };

  const clock = new THREE.Clock();
  const animate = () => {
    const elapsed = clock.getElapsedTime();
    const motionScale = reducedMotionQuery.matches ? 0.22 : 1;

    pointer.x += (pointer.targetX - pointer.x) * 0.055;
    pointer.y += (pointer.targetY - pointer.y) * 0.055;

    root.rotation.y = elapsed * 0.055 * motionScale + pointer.x * 0.21;
    root.rotation.x = pointer.y * 0.11;
    root.rotation.z = pointer.x * 0.035;

    camera.position.x += (pointer.x * 0.42 - camera.position.x) * 0.035;
    camera.position.y += (pointer.y * 0.24 - camera.position.y) * 0.035;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    root.updateMatrixWorld(true);

    hoveredMesh = findHoveredMesh();
    document.body.style.cursor = hoveredMesh ? "crosshair" : "";

    shapeMeshes.forEach((mesh, index) => {
      const { basePosition, phase, spin } = mesh.userData;
      const hoverTarget = mesh === hoveredMesh ? 1 : 0;
      mesh.userData.hover += (hoverTarget - mesh.userData.hover) * 0.14;

      const hover = mesh.userData.hover;
      const drift = Math.sin(elapsed * 0.7 * motionScale + phase) * 0.08;
      const depthDrift = Math.cos(elapsed * 0.52 * motionScale + phase) * 0.05;

      mesh.position.set(
        basePosition.x + pointer.x * (0.08 + index * 0.004),
        basePosition.y + pointer.y * 0.07 + drift,
        basePosition.z + depthDrift,
      );

      mesh.scale.setScalar(mesh.userData.baseScale * (1 + hover * 0.24));
      mesh.material.opacity = 0.13 + hover * 0.12;
      mesh.material.emissiveIntensity = 0.025 + hover * 0.18;
      mesh.userData.edgeMaterial.opacity = 0.42 + hover * 0.16;
      mesh.rotation.x += spin * motionScale;
      mesh.rotation.y += spin * (1.4 + hover * 2.2) * motionScale;
    });

    const hoveredAmount = hoveredMesh ? 1 : 0;
    connectionLines.material.opacity +=
      (0.24 + hoveredAmount * 0.1 - connectionLines.material.opacity) * 0.1;
    dots.material.opacity += (0.58 + hoveredAmount * 0.07 - dots.material.opacity) * 0.1;

    if (hoveredMesh) {
      hoverHalo.visible = true;
      hoverHalo.position.copy(hoveredMesh.position);
      hoverHalo.scale.setScalar(
        hoveredMesh.userData.baseScale *
          (1.35 + Math.sin(elapsed * 5.2) * 0.05),
      );
      hoverHalo.material.color.copy(hoveredMesh.material.color);
      hoverHalo.material.opacity += (0.16 - hoverHalo.material.opacity) * 0.16;
      hoverHalo.rotation.x -= 0.012 * motionScale;
      hoverHalo.rotation.y += 0.018 * motionScale;
    } else {
      hoverHalo.material.opacity += (0 - hoverHalo.material.opacity) * 0.12;
      if (hoverHalo.material.opacity < 0.01) {
        hoverHalo.visible = false;
      }
    }

    updateConnectors();
    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  };

  animate();
}
