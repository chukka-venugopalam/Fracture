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

    // Atlantis sketch entry motion: fly through the plane of the drawing as it's being sketched
    float depthZ = (1.0 - uTransition) * -1.5;
    pos.z += depthZ;

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

  // Graphite paper noise helper
  float paperNoise(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Wobbly line drawing calculator
  float sketchLine(vec2 p, float offset, float thickness) {
    // 1. Head top sphere
    float dHead = length(p - vec2(0.0, 0.15)) - 0.28;
    
    // 2. Profile outline (contour of nose, lips, chin)
    float profileX = -0.12 + 0.07 * sin(p.y * 7.5) * smoothstep(-0.4, 0.1, p.y)
                           + 0.025 * cos(p.y * 22.0) * smoothstep(-0.12, 0.0, p.y);
    float dFace = p.x - profileX;
    float mFace = step(p.y, 0.18) * step(-0.45, p.y);

    // 3. Eye circle
    float dEye = length(p - vec2(-0.06, 0.08)) - 0.022;
    
    // 4. Flowing hair strands
    float hairX = 0.12 + 0.09 * sin(p.y * 12.0 + offset) + 0.035 * cos(p.y * 6.0 + offset * 0.5);
    float dHair = p.x - hairX;
    float mHair = step(p.y, 0.25) * step(-0.55, p.y);
    
    // 5. Collar & Shoulder
    float dShoulder = p.x + 0.08 - (p.y + 0.42) * (p.y + 0.42) * 0.95;
    float mShoulder = step(p.y, -0.42) * step(-0.7, p.y);

    // Introduce wobbly sketch hand jitter
    float wobble = sin(p.x * 60.0 + p.y * 45.0 + offset) * 0.0035;
    dHead += wobble;
    dFace += wobble;
    dEye += wobble;
    dHair += wobble;
    dShoulder += wobble;

    float l1 = smoothstep(thickness, 0.0, abs(dHead));
    float l2 = smoothstep(thickness, 0.0, abs(dFace)) * mFace;
    float l3 = smoothstep(thickness * 0.85, 0.0, abs(dEye));
    float l4 = smoothstep(thickness, 0.0, abs(dHair)) * mHair;
    float l5 = smoothstep(thickness, 0.0, abs(dShoulder)) * mShoulder;

    return max(max(max(l1, l2), l3), max(l4, l5));
  }

  void main() {
    // Correct UV for aspect ratio (background cover)
    vec2 uv = vUv;
    if (uAspect > 1.0) {
      uv.x = (vUv.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      uv.y = (vUv.y - 0.5) / uAspect + 0.5;
    }

    // Near-black slate graphite paper texture
    vec3 slateBg = vec3(0.04, 0.04, 0.045);
    vec3 charcoalShade = vec3(0.015, 0.015, 0.018);
    
    float noiseVal = paperNoise(uv * 450.0);
    vec3 bgRGB = mix(slateBg, charcoalShade, noiseVal * 0.15);
    bgRGB *= (1.0 - distance(uv, vec2(0.5)) * 0.5); // soft vignette

    // Recenter coordinates around portrait center
    vec2 centerUV = uv - vec2(0.5, 0.5);

    // 4-Directional Drawing Mask (top, bottom, left, right converging)
    float distToEdge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    
    // Cycle progress inside preview tiles, snap to 1.0 inside fullscreen transition
    float cycleTime = clamp(mod(uTime * 0.35, 1.4), 0.0, 1.0);
    float drawProgress = mix(cycleTime, 1.0, uTransition);
    
    // March inwards from edges (0.0) to center (0.5 max)
    float drawThreshold = drawProgress * 0.52;
    float drawMask = smoothstep(drawThreshold - 0.08, drawThreshold, distToEdge);

    // Line thickness scales dynamically with uStudyMode (bold at tile size, fine in study mode)
    float thickness = mix(0.013, 0.0055, uStudyMode);

    // Get graphite pencil line drawing
    float graphiteDrawing = sketchLine(centerUV, 0.0, thickness);

    // Pulse electric cyan glow vein lines running through the sketch
    float glowVeinPattern = sketchLine(centerUV, 3.8, thickness * 1.55);
    float veinMask = step(0.65, sin(centerUV.y * 12.0 - uTime * 2.2 + centerUV.x * 8.0));
    float pulse = 0.65 + 0.35 * sin(uTime * 4.0);
    vec3 veinColor = vec3(0.0, 0.88, 1.0) * (2.8 + pulse * 1.5) * glowVeinPattern * veinMask;

    // Standard graphite pencil grey color
    vec3 pencilColor = vec3(0.25, 0.26, 0.28) * (0.82 + noiseVal * 0.18);

    // Mix pencil lines and glow veins
    vec3 drawingColor = mix(pencilColor, veinColor, glowVeinPattern * veinMask * 0.85);

    // Blend background paper with sketches
    vec3 finalColor = mix(bgRGB, drawingColor, graphiteDrawing * drawMask);
    
    // Add soft glow bleeding to the paper
    finalColor += veinColor * 0.15 * drawMask;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface AtlantisWorldProps {
  studyMode?: boolean;
  transitionProgress?: React.RefObject<number>;
}

export default function AtlantisWorld({ studyMode = false, transitionProgress }: AtlantisWorldProps) {
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
