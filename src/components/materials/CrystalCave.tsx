"use client";

import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
  uniform float uTransition;
  varying vec2 vUv;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Crystal enclosure entry transition: push vertices slightly forward on Z as we zoom
    float splitProgress = uTransition * (1.0 - uTransition) * 4.0;
    pos.z += splitProgress * 0.4;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uAspect;
  uniform float uStudyMode;
  uniform float uTransition;
  varying vec2 vUv;
  varying vec3 vViewPosition;

  // Pointed crystal distance function
  float crystalShape(vec2 p, vec2 origin, float angle, float length, float width) {
    vec2 diff = p - origin;
    float c = cos(angle);
    float s = sin(angle);
    vec2 r = vec2(diff.x * c - diff.y * s, diff.x * s + diff.y * c);
    
    // Diamond coordinate profile
    float xDist = abs(r.x) / width;
    float yDist = r.y / length;
    float d = xDist + yDist;
    
    return smoothstep(1.0, 0.95, d) * step(0.0, r.y) * step(r.y, length);
  }

  void main() {
    // Correct UV for aspect ratio
    vec2 uv = vUv;
    if (uAspect > 1.0) {
      uv.x = (vUv.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      uv.y = (vUv.y - 0.5) / uAspect + 0.5;
    }

    // Deep cave base background color
    vec3 caveDeepColor = vec3(0.02, 0.005, 0.04); // dark violet
    vec3 caveBrightColor = vec3(0.18, 0.03, 0.28); // glowing purple-magenta
    vec3 bgColor = mix(caveDeepColor, caveBrightColor, 1.0 - distance(uv, vec2(0.5)) * 1.5);

    // 1. Surrounding Cave Vignette rock walls
    float distToCenter = distance(uv, vec2(0.5));
    float caveWalls = smoothstep(0.38, 0.48, distToCenter);
    vec3 wallColor = vec3(0.05, 0.02, 0.08) * (1.0 - caveWalls * 0.3);

    // 2. Growing Crystal Cluster
    // Staggered growth cycle (pulses over time, expands fully on transition)
    float baseGrowth = 0.35 + 0.35 * sin(uTime * 0.8);
    // Enclose screen during entrance transition
    float transitionGrowth = uTransition * uTransition * 1.6;
    float growth = baseGrowth + transitionGrowth;

    float crystals = 0.0;
    float crystalShine = 0.0;
    
    // Draw 8 crystals growing inward from the circular border
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      // Angle offset per crystal (45 degrees steps + weave wobble)
      float angle = fi * 0.785398 + sin(uTime * 0.3 + fi * 2.0) * 0.08;
      vec2 origin = vec2(0.5) + vec2(cos(angle), sin(angle)) * 0.48;

      float len = (0.16 + 0.1 * fract(fi * 23.456)) * growth;
      float wid = 0.032 + 0.008 * sin(uTime * 0.4 + fi);

      // Rotate 180 deg to point inward
      float shape = crystalShape(uv, origin, angle + 3.14159, len, wid);

      // Facet refraction shimmer effect
      float shine = max(0.0, sin(uv.x * 40.0 + uv.y * 40.0 - uTime * 2.2 + fi * 1.8));

      crystals = max(crystals, shape);
      crystalShine += shape * shine;
    }

    // Blend crystal colors (cyan/magenta refraction)
    vec3 crystalBase = mix(
      vec3(0.68, 0.02, 0.85), // neon violet
      vec3(0.0, 0.78, 0.95),  // crystal cyan
      0.5 + 0.5 * sin(uTime * 0.5 + uv.x * 2.0)
    );

    vec3 crystalColor = crystalBase * (0.65 + crystalShine * 0.65) + vec3(1.0) * crystalShine * 0.4;
    
    // Combine background, cave rock borders, and crystals
    vec3 finalColor = mix(bgColor, wallColor, caveWalls);
    finalColor = mix(finalColor, crystalColor, crystals);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface CrystalCaveProps {
  studyMode?: boolean;
  transitionProgress?: React.RefObject<number>;
}

export default function CrystalCave({ studyMode = false, transitionProgress }: CrystalCaveProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  const aspect = studyMode ? (size.width / size.height) : 1.0;

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
      uAspect: { value: 1.0 },
      uStudyMode: { value: 0.0 },
      uTransition: { value: 0.0 },
    };
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uAspect.value = aspect;
      materialRef.current.uniforms.uStudyMode.value = studyMode ? 1.0 : 0.0;
      materialRef.current.uniforms.uTransition.value = transitionProgress?.current ?? 0.0;
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <planeGeometry args={[2.2, 2.2]} />
        <shaderMaterial
          ref={materialRef}
          attach="material"
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>

      {/* Frame border */}
      {!studyMode && (
        <mesh position={[0, 0, 0.015]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(2.2, 2.2)]} />
          <lineBasicMaterial color="#ffffff" opacity={0.06} transparent />
        </mesh>
      )}
    </group>
  );
}
