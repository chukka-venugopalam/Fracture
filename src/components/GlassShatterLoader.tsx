"use client";

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const tempV = new THREE.Vector3();

// Custom shader for the glowing stitching threads
const threadVertexShader = `
  uniform float uProgress;
  attribute float aProgress;
  varying float vProgress;
  varying float vAlpha;

  void main() {
    vProgress = aProgress;
    
    // Draw only up to the current progress
    if (aProgress > uProgress) {
      vAlpha = 0.0;
    } else {
      // Glow at the leading tip of the thread, fade out behind it
      float distToTip = uProgress - aProgress;
      vAlpha = smoothstep(0.3, 0.0, distToTip) * 0.9 + 0.1;
    }

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const threadFragmentShader = `
  uniform vec3 uColor;
  uniform float uProgress;
  varying float vProgress;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.0) discard;
    
    // Gradient: leading edge is bright white/glowing, body is colored
    float tipGlow = pow(vAlpha, 3.0);
    vec3 glowColor = mix(uColor, vec3(1.0, 1.0, 1.0), tipGlow * 0.8);
    
    gl_FragColor = vec4(glowColor, vAlpha);
  }
`;

// Shaders for the glass shards with custom refraction & caustics
const glassVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const glassFragmentShader = `
  uniform float uTime;
  uniform float uShatterStart;
  uniform float uImpactZ;
  uniform float uGlassOpacity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Diagonal gradient ratio from top-left (pink-white) to bottom-right (cool light blue)
    float diag = vWorldPosition.x - vWorldPosition.y;
    float gradRatio = clamp((diag + 2.0) / 4.0, 0.0, 1.0);
    
    vec3 pinkWhite = vec3(1.0, 0.72, 0.85);
    vec3 coolBlue = vec3(0.35, 0.78, 1.0);
    vec3 baseGlassColor = mix(pinkWhite, coolBlue, gradRatio);

    // Procedural caustics & refraction colors
    vec3 refractDir = refract(-viewDir, normal, 0.65);
    
    // Chromatic dispersion carrying same color identity
    float cosTheta = max(dot(normal, viewDir), 0.0);
    float dispersion = sin(refractDir.x * 12.0 + uTime * 0.7) * 0.5 + 0.5;
    vec3 causticColor = mix(pinkWhite * 0.92, coolBlue * 1.25, dispersion);

    // Sparkling specular flashes
    vec3 lightDir = normalize(vec3(3.0, 5.0, 4.0));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 90.0) * 2.8;
    vec3 specularFlash = vec3(1.0, 1.0, 1.0) * spec;

    // Faint reflection
    float fresnel = pow(1.0 - cosTheta, 3.0) * 0.45;
    
    // Combine glass properties using the base glass color identity
    vec3 glassColor = baseGlassColor * (causticColor * 0.65 + 0.35) * (fresnel * 0.7 + 0.28) + specularFlash;
    
    gl_FragColor = vec4(glassColor, uGlassOpacity * 0.88);
  }
`;

import { soundEngine } from "@/utils/audio";

interface GlassShatterLoaderProps {
  progress: number;
  loaderState: "loading" | "impact" | "shattering" | "completed";
  setLoaderState: (state: "loading" | "impact" | "shattering" | "completed") => void;
  collisionTriggered: boolean;
  setCollisionTriggered: (triggered: boolean) => void;
  reducedMotion?: boolean;
}

interface ShardData {
  geometry: THREE.BufferGeometry;
  initialPos: THREE.Vector3;
  pos: THREE.Vector3;
  rot: THREE.Euler;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  posAtBurst?: THREE.Vector3;
  rotAtBurst?: THREE.Euler;
}

const BALL_RADIUS = 0.26;
const GLASS_Z = 0.8;

export default function GlassShatterLoader({
  progress,
  loaderState,
  setLoaderState,
  collisionTriggered,
  setCollisionTriggered,
  reducedMotion = false,
}: GlassShatterLoaderProps) {
  const { size, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  
  const stitchingBallRef = useRef<THREE.Mesh>(null);
  const launchingBallRef = useRef<THREE.Group>(null);
  const glassPaneRef = useRef<THREE.Mesh>(null);
  const frameRef = useRef<THREE.LineSegments>(null);

  const shardMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const shardsRef = useRef<ShardData[]>([]);

  const shatterTimeStart = useRef<number>(0);
  const timeDilation = useRef<number>(0.06); // Act 3: starts in extreme slow-mo
  const humStarted = useRef<boolean>(false);

  // Radial crack wireframe geometry generated mathematically on impact
  const crackLinesGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const ringCount = 6;
    const spokeCount = 14;
    
    // Generate spokes starting at center [0,0,0] radiating outward with organic jitter
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const startPt = new THREE.Vector3(0, 0, 0);
      points.push(startPt);
      
      let lastPt = startPt;
      for (let r = 1; r <= ringCount; r++) {
        const dist = (r / ringCount) * 2.2;
        const jitterAngle = angle + (Math.sin(r * 4.0) * 0.1) + (Math.random() - 0.5) * 0.08;
        const nextPt = new THREE.Vector3(
          Math.sin(jitterAngle) * dist,
          Math.cos(jitterAngle) * dist,
          (Math.random() - 0.5) * 0.03
        );
        points.push(nextPt);
        if (r < ringCount) {
          points.push(nextPt);
        }
        lastPt = nextPt;
      }
    }
    
    // Generate concentric ring segments with spiderweb connects
    for (let r = 1; r <= ringCount; r++) {
      const dist = (r / ringCount) * 1.8;
      for (let i = 0; i < spokeCount; i++) {
        const a1 = (i / spokeCount) * Math.PI * 2;
        const a2 = ((i + 1) / spokeCount) * Math.PI * 2;
        
        const p1 = new THREE.Vector3(Math.sin(a1) * dist, Math.cos(a1) * dist, 0);
        const p2 = new THREE.Vector3(Math.sin(a2) * dist, Math.cos(a2) * dist, 0);
        points.push(p1);
        points.push(p2);
      }
    }
    
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  // 1. Thread Line Geometries for Stitching
  const threadGeometry = useMemo(() => {
    const spiralCount = 12;
    const segmentsPerSpiral = 120;
    const vertices: number[] = [];
    const aProgressArr: number[] = [];

    for (let s = 0; s < spiralCount; s++) {
      const startAngle = (s / spiralCount) * Math.PI * 2;
      for (let i = 0; i < segmentsPerSpiral; i++) {
        const t1 = i / segmentsPerSpiral;
        const t2 = (i + 1) / segmentsPerSpiral;

        const theta1 = -Math.PI / 2 + t1 * Math.PI;
        const phi1 = t1 * 6.5 * Math.PI + startAngle; // 3.25 full loops

        const x1 = BALL_RADIUS * Math.cos(theta1) * Math.cos(phi1);
        const y1 = BALL_RADIUS * Math.sin(theta1);
        const z1 = BALL_RADIUS * Math.cos(theta1) * Math.sin(phi1);

        const theta2 = -Math.PI / 2 + t2 * Math.PI;
        const phi2 = t2 * 6.5 * Math.PI + startAngle;

        const x2 = BALL_RADIUS * Math.cos(theta2) * Math.cos(phi2);
        const y2 = BALL_RADIUS * Math.sin(theta2);
        const z2 = BALL_RADIUS * Math.cos(theta2) * Math.sin(phi2);

        vertices.push(x1, y1, z1, x2, y2, z2);
        aProgressArr.push(t1, t2);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute("aProgress", new THREE.Float32BufferAttribute(aProgressArr, 1));
    return geom;
  }, []);

  // Thread material
  const threadMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: threadVertexShader,
      fragmentShader: threadFragmentShader,
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new THREE.Color("#00aaff") },
      },
      transparent: true,
      depthWrite: true,
    });
  }, []);

  // 2. Stitching Particle System
  const particleCount = 180;
  const particlesData = useMemo(() => {
    const arr = [];
    for (let i = 0; i < particleCount; i++) {
      // Target coordinates on sphere surface
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      
      const tx = BALL_RADIUS * Math.sin(phi) * Math.cos(theta);
      const ty = BALL_RADIUS * Math.sin(phi) * Math.sin(theta);
      const tz = BALL_RADIUS * Math.cos(phi);

      // Start coordinates (outer space)
      const r = 2.5 + Math.random() * 1.5;
      const sx = r * Math.sin(phi) * Math.cos(theta + Math.PI);
      const sy = r * Math.sin(phi) * Math.sin(theta + Math.PI);
      const sz = r * Math.cos(phi);

      arr.push({
        target: new THREE.Vector3(tx, ty, tz),
        start: new THREE.Vector3(sx, sy, sz),
        offset: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.4,
      });
    }
    return arr;
  }, []);

  const particleGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geom;
  }, []);

  // 3. Shard geometries for Glass Shatter
  const shardMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: glassVertexShader,
      fragmentShader: glassFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uShatterStart: { value: 0.0 },
        uImpactZ: { value: GLASS_Z },
        uGlassOpacity: { value: 0.0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
  }, []);

  const glassShards = useMemo(() => {
    const width = 7.5;
    const height = 5.2;
    const cols = 4;
    const rows = 5;
    const thickness = 0.05;

    const grid: THREE.Vector2[][] = [];
    const cellW = width / cols;
    const cellH = height / rows;

    for (let c = 0; c <= cols; c++) {
      grid[c] = [];
      for (let r = 0; r <= rows; r++) {
        const x = -width / 2 + c * cellW;
        const y = -height / 2 + r * cellH;
        
        let px = x;
        let py = y;
        if (c > 0 && c < cols && r > 0 && r < rows) {
          // Perturb vertices near the center impact zone to produce smaller, organic shards
          const distToImpact = Math.sqrt(x*x + y*y);
          const impactInfluence = Math.exp(-distToImpact * 0.8);
          const jitterScale = 0.42 * (1.0 - 0.5 * impactInfluence);
          px += (Math.random() - 0.5) * cellW * jitterScale;
          py += (Math.random() - 0.5) * cellH * jitterScale;
        }
        grid[c].push(new THREE.Vector2(px, py));
      }
    }

    const shardsArray: ShardData[] = [];

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const v00 = grid[c][r];
        const v10 = grid[c + 1][r];
        const v11 = grid[c + 1][r + 1];
        const v01 = grid[c][r + 1];

        // Split quad into triangles around local center
        const cx = (v00.x + v10.x + v11.x + v01.x) / 4;
        const cy = (v00.y + v10.y + v11.y + v01.y) / 4;
        const center = new THREE.Vector2(cx, cy);

        const tris = [
          [center, v00, v10],
          [center, v10, v11],
          [center, v11, v01],
          [center, v01, v00]
        ];

        tris.forEach((tri) => {
          const A = tri[0];
          const B = tri[1];
          const C = tri[2];

          const shardCent = new THREE.Vector3(
            (A.x + B.x + C.x) / 3,
            (A.y + B.y + C.y) / 3,
            0.0
          );

          const z0 = -thickness / 2;
          const z1 = thickness / 2;

          const rAf = new THREE.Vector3(A.x - shardCent.x, A.y - shardCent.y, z1);
          const rBf = new THREE.Vector3(B.x - shardCent.x, B.y - shardCent.y, z1);
          const rCf = new THREE.Vector3(C.x - shardCent.x, C.y - shardCent.y, z1);
          const rAb = new THREE.Vector3(A.x - shardCent.x, A.y - shardCent.y, z0);
          const rBb = new THREE.Vector3(B.x - shardCent.x, B.y - shardCent.y, z0);
          const rCb = new THREE.Vector3(C.x - shardCent.x, C.y - shardCent.y, z0);

          const verts = new Float32Array([
            // Front
            rAf.x, rAf.y, rAf.z, rBf.x, rBf.y, rBf.z, rCf.x, rCf.y, rCf.z,
            // Back
            rAb.x, rAb.y, rAb.z, rCb.x, rCb.y, rCb.z, rBb.x, rBb.y, rBb.z,
            // Sides
            rAf.x, rAf.y, rAf.z, rAb.x, rAb.y, rAb.z, rBf.x, rBf.y, rBf.z,
            rBf.x, rBf.y, rBf.z, rAb.x, rAb.y, rAb.z, rBb.x, rBb.y, rBb.z,

            rBf.x, rBf.y, rBf.z, rBb.x, rBb.y, rBb.z, rCf.x, rCf.y, rCf.z,
            rCf.x, rCf.y, rCf.z, rBb.x, rBb.y, rBb.z, rCb.x, rCb.y, rCb.z,

            rCf.x, rCf.y, rCf.z, rCb.x, rCb.y, rCb.z, rAf.x, rAf.y, rAf.z,
            rAf.x, rAf.y, rAf.z, rCb.x, rCb.y, rCb.z, rAb.x, rAb.y, rAb.z,
          ]);

          const geom = new THREE.BufferGeometry();
          geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
          geom.computeVertexNormals();

          // Outward blast physics
          const distFromImpact = Math.sqrt(shardCent.x*shardCent.x + shardCent.y*shardCent.y);
          const blastDir = new THREE.Vector3(
            shardCent.x,
            shardCent.y,
            distFromImpact * 0.1 // pushes slightly back
          ).normalize();

          // Outward scatter speed (higher near center)
          const speed = (2.2 + Math.random() * 2.8) * Math.exp(-distFromImpact * 0.35);
          const vel = new THREE.Vector3(
            blastDir.x * speed,
            blastDir.y * speed,
            4.0 + Math.random() * 3.5 // fly towards camera
          );

          const rotVel = new THREE.Vector3(
            (Math.random() - 0.5) * 6.5,
            (Math.random() - 0.5) * 6.5,
            (Math.random() - 0.5) * 6.5
          );

          shardsArray.push({
            geometry: geom,
            initialPos: shardCent.clone(),
            pos: shardCent.clone(),
            rot: new THREE.Euler(0, 0, 0),
            vel,
            rotVel,
          });
        });
      }
    }
    return shardsArray;
  }, []);

  useEffect(() => {
    shardsRef.current = glassShards;
  }, [glassShards]);

  // Frame simulation loop
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = state.clock.getElapsedTime();

    // Pass time to shard shader
    shardMaterial.uniforms.uTime.value = time;

    // 1. Act 1: Stitching Mode
    if (loaderState === "loading") {
      // Trigger Web Audio hum drone once and update its progress
      if (!humStarted.current) {
        humStarted.current = true;
        soundEngine.startHum();
      }
      soundEngine.updateHumProgress(progress);

      const ratio = progress / 100;
      threadMaterial.uniforms.uProgress.value = ratio;

      // Update stitching particle positions
      const posAttr = particleGeometry.getAttribute("position") as THREE.BufferAttribute;
      if (posAttr) {
        particlesData.forEach((part, i) => {
          // Spiraling lerp path
          const pRatio = Math.min(ratio * part.speed, 1.0);
          
          tempV.lerpVectors(part.start, part.target, pRatio);
          // Spiral spin around Y axis
          const angle = (1.0 - pRatio) * 6.0 + part.offset;
          const s = Math.sin(angle);
          const c = Math.cos(angle);
          const rx = tempV.x * c - tempV.z * s;
          const rz = tempV.x * s + tempV.z * c;
          
          posAttr.setXYZ(i, rx, tempV.y, rz);
        });
        posAttr.needsUpdate = true;
      }

      // Make the inner solid ball gradually fade in as stitching finishes
      const stitchBall = stitchingBallRef.current;
      if (stitchBall) {
        const mat = stitchBall.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.opacity = smoothstep(0.7, 1.0, ratio) * 0.95;
        }
        stitchBall.scale.setScalar(smoothstep(0.6, 1.0, ratio));
      }

      // Fade in the glass pane and border frame during final loader phase (ratio > 0.60, ~0.8s)
      const glassPane = glassPaneRef.current;
      if (glassPane) {
        shardMaterial.uniforms.uGlassOpacity.value = Math.max(0, ratio - 0.6) * 2.5;
      }

      const frameBorder = frameRef.current;
      if (frameBorder) {
        const mat = frameBorder.material as THREE.LineBasicMaterial;
        if (mat) {
          mat.opacity = Math.max(0, ratio - 0.6) * 2.5 * 0.35;
        }
      }

      // Pulse camera slightly during load for atmosphere (skip if reducedMotion)
      if (!reducedMotion) {
        camera.position.z = 5.0 + Math.sin(time * 0.8) * 0.05;
      } else {
        camera.position.z = 5.0;
      }
    }

    // 2. Act 2: Ball launches forward
    if (loaderState === "impact") {
      shardMaterial.uniforms.uGlassOpacity.value = 1.0; // fully visible before impact

      // Stop the loader hum cleanly before launch impact
      if (humStarted.current) {
        soundEngine.stopHum();
        humStarted.current = false;
      }

      const clock = state.clock as any;
      if (clock.impactStart === undefined) {
        clock.impactStart = time;
      }
      const elapsed = time - clock.impactStart;
      const duration = 0.82; // ~0.8s launch time

      const launchBall = launchingBallRef.current;
      if (launchBall) {
        if (elapsed < duration) {
          const t = elapsed / duration;
          // Pull back slightly first, then shoot forward rapidly (impact punch)
          const zPos = t < 0.28 
            ? THREE.MathUtils.lerp(0.0, -1.0, t / 0.28)
            : THREE.MathUtils.lerp(-1.0, GLASS_Z, (t - 0.28) / (1.0 - 0.28));
          
          launchBall.position.set(0, 0, zPos);
          
          // Camera pulls back (skip if reducedMotion)
          if (!reducedMotion) {
            camera.position.z = 5.0 + (t * 0.4);
          }
        } else {
          // Impact collision triggers!
          launchBall.position.set(0, 0, GLASS_Z);
          setCollisionTriggered(true);
          setLoaderState("shattering");
        }
      }
    }

    // 3. Act 3: Shatter & Reassembly Transition
    if (loaderState === "shattering") {
      if (shatterTimeStart.current === 0.0) {
        shatterTimeStart.current = time;
        shardMaterial.uniforms.uShatterStart.value = time;
        shardMaterial.uniforms.uGlassOpacity.value = 1.0;
        // Trigger glass crack sound
        soundEngine.playImpact();
      }

      const elapsedShatter = time - shatterTimeStart.current;

      // Time dilation curve: starts extremely slow (0.06) and recovers to normal (1.0)
      // If reducedMotion is true, skip dilation for a calmer normal speed frame rate
      timeDilation.current = reducedMotion 
        ? 1.0 
        : THREE.MathUtils.lerp(0.06, 1.0, smoothstep(0.0, 1.0, elapsedShatter));

      // Calculate dilated time step
      const dilatedDt = dt * timeDilation.current;

      const reassemblyStart = 1.0; // Shards fly outward for 1.0 seconds
      const reassemblyDuration = 1.3;
      const reassemblyEnd = reassemblyStart + reassemblyDuration; // 2.3s total

      if (elapsedShatter > reassemblyStart) {
        // Converge timeline progress
        const rProg = Math.min(1.0, (elapsedShatter - reassemblyStart) / reassemblyDuration);
        const easeProg = smoothstep(0.0, 1.0, rProg);

        shardsRef.current.forEach((shard, i) => {
          const mesh = shardMeshes.current[i];
          if (!mesh) return;

          if (shard.posAtBurst === undefined || shard.rotAtBurst === undefined) {
            shard.posAtBurst = shard.pos.clone();
            shard.rotAtBurst = shard.rot.clone();
          }

          // Target coordinate: wrap onto a sphere of radius 0.55 at Z=0.0
          tempV.copy(shard.initialPos);
          tempV.z = 0.0;
          tempV.normalize().multiplyScalar(0.55);

          // Smoothly lerp shards back to target core coordinates
          shard.pos.lerpVectors(shard.posAtBurst!, tempV, easeProg);
          shard.rot.x = THREE.MathUtils.lerp(shard.rotAtBurst!.x, 0, easeProg);
          shard.rot.y = THREE.MathUtils.lerp(shard.rotAtBurst!.y, 0, easeProg);
          shard.rot.z = THREE.MathUtils.lerp(shard.rotAtBurst!.z, 0, easeProg);

          mesh.position.copy(shard.pos);
          mesh.rotation.copy(shard.rot);
        });

        // Fade out the shards near the end of reassembly
        shardMaterial.uniforms.uGlassOpacity.value = 1.0 - smoothstep(0.6, 1.0, easeProg);
      } else {
        // Act 3a: Outward Shatter physics
        const airResistance = reducedMotion ? 1.5 : 0.35;
        shardsRef.current.forEach((shard, i) => {
          const mesh = shardMeshes.current[i];
          if (!mesh) return;

          const velocityMultiplier = reducedMotion ? 0.04 : 1.0;

          shard.vel.multiplyScalar(Math.exp(-airResistance * dilatedDt));
          tempV.copy(shard.vel).multiplyScalar(velocityMultiplier);
          shard.pos.addScaledVector(tempV, dilatedDt);

          shard.rot.x += shard.rotVel.x * dilatedDt * velocityMultiplier;
          shard.rot.y += shard.rotVel.y * dilatedDt * velocityMultiplier;
          shard.rot.z += shard.rotVel.z * dilatedDt * velocityMultiplier;

          mesh.position.copy(shard.pos);
          mesh.rotation.copy(shard.rot);
        });

        shardMaterial.uniforms.uGlassOpacity.value = 1.0;
      }

      // Camera motion: continuous orbit pan that eases flat on reassembly
      if (reducedMotion) {
        camera.position.set(0, 0, 5.0);
        camera.lookAt(0, 0, 0);
      } else {
        const orbitSpeed = 0.45;
        const fadeCam = 1.0 - smoothstep(reassemblyStart, reassemblyEnd, elapsedShatter);
        const angle = Math.sin(elapsedShatter * orbitSpeed) * 0.15 * fadeCam;
        camera.position.x = Math.sin(angle) * 5.4;
        camera.position.z = Math.cos(angle) * 5.4;
        camera.lookAt(0, 0, 0);
      }

      // Settle and scale down launching ball as it merges into the center
      const launchBall = launchingBallRef.current;
      if (launchBall) {
        if (elapsedShatter > reassemblyStart) {
          const rProg = Math.min(1.0, (elapsedShatter - reassemblyStart) / reassemblyDuration);
          const easeProg = smoothstep(0.0, 1.0, rProg);
          launchBall.position.z = THREE.MathUtils.lerp(GLASS_Z, 0.0, easeProg);
          launchBall.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.0, easeProg));
        } else {
          launchBall.position.z += (0.0 - launchBall.position.z) * 6 * dt;
          launchBall.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.6, smoothstep(0.0, reassemblyStart, elapsedShatter)));
        }
      }

      // Terminate loader when reassembly converges (2.4 seconds total)
      if (elapsedShatter >= 2.4) {
        setLoaderState("completed");
        // Reset camera positions to default
        camera.position.set(0, 0, 5.0);
        camera.lookAt(0, 0, 0);
      }
    }
  });

  const smoothstep = (min: number, max: number, value: number) => {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
  };

  return (
    <group ref={groupRef}>
      {/* --- ACT 1: Stitching Formation --- */}
      {loaderState === "loading" && (
        <group>
          {/* Geodesic Stitching Wires */}
          <lineSegments geometry={threadGeometry} material={threadMaterial} />

          {/* Stitching Particle Dust cloud */}
          <points geometry={particleGeometry}>
            <pointsMaterial
              color="#00ffff"
              size={0.03}
              transparent
              opacity={0.7}
              sizeAttenuation
            />
          </points>

          {/* Glowing forming ball inside */}
          <mesh ref={stitchingBallRef}>
            <sphereGeometry args={[BALL_RADIUS * 0.95, 32, 32]} />
            <meshStandardMaterial
              color="#00e5ff"
              emissive="#00e5ff"
              emissiveIntensity={0.8}
              transparent
              opacity={0}
              roughness={0.1}
            />
          </mesh>
        </group>
      )}

      {/* --- ACT 2 & 3: Launching Ball --- */}
      {(loaderState === "impact" || loaderState === "shattering") && (
        <group ref={launchingBallRef}>
          {/* Main Glowing Ball */}
          <mesh>
            <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[BALL_RADIUS * 1.35, 32, 32]} />
            <meshPhysicalMaterial
              color="#00e5ff"
              emissive="#00e5ff"
              emissiveIntensity={4.5}
              roughness={0.05}
              transmission={0.9}
              thickness={0.05}
              transparent
              opacity={0.7}
            />
          </mesh>
          {/* Dynamic Cyan approach spotlight casting light on glass */}
          {loaderState === "impact" && (
            <pointLight color="#00e5ff" intensity={4.5} distance={6.0} decay={1.5} />
          )}
        </group>
      )}

      {loaderState !== "shattering" && loaderState !== "completed" && (
        <group position={[0, 0, GLASS_Z]}>
          {/* Glass Pane with High Specular and Refraction Sheen */}
          <mesh ref={glassPaneRef} material={shardMaterial}>
            <planeGeometry args={[7.5, 5.2]} />
          </mesh>
          {/* Glowing Border Frame Line segments */}
          <lineSegments ref={frameRef} position={[0, 0, 0.01]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(7.48, 5.18)]} />
            <lineBasicMaterial color="#00e5ff" opacity={0} transparent />
          </lineSegments>
          {/* Glowing crack lines flashing on impact coordinate */}
          {collisionTriggered && (
            <lineSegments geometry={crackLinesGeometry} position={[0, 0, 0.02]}>
              <lineBasicMaterial color="#00e5ff" linewidth={2.5} transparent opacity={0.8} />
            </lineSegments>
          )}
        </group>
      )}

      {/* --- ACT 3: Fractured Shards --- */}
      {loaderState === "shattering" && (
        <group position={[0, 0, GLASS_Z]}>
          {glassShards.map((shard, i) => (
            <mesh
              key={i}
              ref={(el) => {
                shardMeshes.current[i] = el;
              }}
              geometry={shard.geometry}
              position={shard.initialPos}
              material={shardMaterial}
            />
          ))}
        </group>
      )}
    </group>
  );
}
