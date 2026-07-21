"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const backgroundVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const backgroundFragmentShader = `
  uniform float uTime;
  uniform float uTransition;
  varying vec2 vUv;

  // Simple pseudo-random hash
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // 2D Noise
  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vUv;

    // Interpolation parameters based on uTransition
    vec3 baseSpaceBg;
    float pinkStrength;
    float blueStrength;
    float speedScale;
    float noiseScale;
    float sparkleStrength = 0.0;

    if (uTransition <= 1.0) {
      float t = uTransition;
      baseSpaceBg = mix(vec3(0.01, 0.01, 0.022), vec3(0.015, 0.015, 0.035), t);
      pinkStrength = mix(0.18, 0.38, t);
      blueStrength = mix(0.48, 0.68, t);
      speedScale = mix(0.5, 1.3, t);
      noiseScale = mix(1.3, 2.3, t);
    } else if (uTransition <= 2.0) {
      float t = uTransition - 1.0;
      baseSpaceBg = mix(vec3(0.015, 0.015, 0.035), vec3(0.012, 0.01, 0.028), t);
      pinkStrength = mix(0.38, 0.58, t);
      blueStrength = mix(0.68, 0.28, t);
      speedScale = mix(1.3, 0.8, t);
      noiseScale = mix(2.3, 1.7, t);
      sparkleStrength = mix(0.0, 1.2, t);
    } else if (uTransition <= 3.0) {
      float t = uTransition - 2.0;
      baseSpaceBg = mix(vec3(0.012, 0.01, 0.028), vec3(0.005, 0.005, 0.012), t);
      pinkStrength = mix(0.58, 0.08, t);
      blueStrength = mix(0.28, 0.12, t);
      speedScale = mix(0.8, 0.35, t);
      noiseScale = mix(1.7, 0.9, t);
      sparkleStrength = mix(1.2, 0.0, t);
    } else {
      float t = clamp(uTransition - 3.0, 0.0, 1.0);
      baseSpaceBg = mix(vec3(0.005, 0.005, 0.012), vec3(0.038, 0.03, 0.068), t);
      pinkStrength = mix(0.08, 0.88, t);
      blueStrength = mix(0.12, 0.98, t);
      speedScale = mix(0.35, 0.2, t);
      noiseScale = mix(0.9, 0.7, t);
    }

    // Drifting coordinates for soft aurora bands
    float slowTime = uTime * 0.05 * speedScale;
    
    // Band 1: Rose/Pink band moving diagonally
    vec2 p1 = uv * 2.2 * noiseScale + vec2(slowTime * 0.5, -slowTime * 0.35);
    float band1 = sin(uv.x * 1.5 + uv.y * 1.2 + slowTime * 0.8) * 0.5 + 0.5;
    band1 *= noise2d(p1);

    // Band 2: Cool Blue band moving counter-diagonally
    vec2 p2 = uv * 2.0 * noiseScale + vec2(-slowTime * 0.3, slowTime * 0.45);
    float band2 = cos(uv.x * 1.2 - uv.y * 1.8 - slowTime) * 0.5 + 0.5;
    band2 *= noise2d(p2);

    // Ambient radial falloff to keep edges dark and vignette-like
    float dist = distance(uv, vec2(0.5, 0.5));
    float falloff = clamp(1.0 - dist * 1.4, 0.0, 1.0);
    
    // Base glow colors matching established pink-blue range
    vec3 pinkGlow = vec3(0.85, 0.35, 0.55) * pinkStrength * band1 * falloff;
    vec3 blueGlow = vec3(0.25, 0.55, 0.95) * blueStrength * band2 * falloff;
    
    vec3 finalColor = baseSpaceBg + pinkGlow + blueGlow;

    // Grid-based sparkle particles (active only during Crystal Growth transition)
    vec2 sparkleUV = uv * 30.0;
    vec2 sparkleGrid = fract(sparkleUV) - 0.5;
    vec2 sparkleId = floor(sparkleUV);
    float sparkleNoise = hash(sparkleId);
    float sparkleVal = 0.0;
    if (sparkleNoise > 0.92) {
      float size = 0.12 + sin(uTime * 3.5 + sparkleNoise * 10.0) * 0.08;
      float d = length(sparkleGrid);
      sparkleVal = smoothstep(size, 0.01, d) * (0.7 + 0.3 * sin(uTime * 4.0 + sparkleNoise * 6.28));
    }
    vec3 sparkleLayer = vec3(1.0, 0.90, 0.98) * sparkleVal * sparkleStrength * falloff;
    finalColor += sparkleLayer;

    // Drifting horizontal stardust lines/streaks (active only during Crystal Growth transition)
    vec2 lineUV = uv * vec2(15.0, 60.0) + vec2(uTime * 0.18, uTime * 0.04);
    float streaks = noise2d(lineUV) * 0.05 * sparkleStrength * falloff;
    finalColor += vec3(0.9, 0.95, 1.0) * streaks;

    // Faint grain noise for organic texture and gradient banding prevention
    float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += vec3(grain * 0.003);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface AmbientBackgroundProps {
  scrollProgress?: number;
}

export default function AmbientBackground({ scrollProgress = 0 }: AmbientBackgroundProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
      uTransition: { value: 0 },
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = state.clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      
      // Interpolate transition progress smoothly to sync in lockstep with the core
      const currentTransition = materialRef.current.uniforms.uTransition.value;
      let targetTransition = 0.0;
      if (scrollProgress <= 0.2) {
        targetTransition = (scrollProgress / 0.2) * 1.0;
      } else if (scrollProgress <= 0.4) {
        targetTransition = 1.0 + ((scrollProgress - 0.2) / 0.2) * 1.0;
      } else if (scrollProgress <= 0.6) {
        targetTransition = 2.0 + ((scrollProgress - 0.4) / 0.2) * 1.0;
      } else if (scrollProgress <= 0.8) {
        targetTransition = 3.0 + ((scrollProgress - 0.6) / 0.2) * 1.0;
      } else {
        targetTransition = 4.0;
      }
      const isTest = typeof window !== "undefined" && window.location.search.includes("test=true");
      if (isTest) {
        materialRef.current.uniforms.uTransition.value = targetTransition;
      } else {
        materialRef.current.uniforms.uTransition.value += (targetTransition - currentTransition) * 5.0 * dt;
      }
    }
  });

  return (
    <mesh position={[0, 0, -8]} scale={[25, 25, 1]}>
      <planeGeometry />
      <shaderMaterial
        ref={materialRef}
        vertexShader={backgroundVertexShader}
        fragmentShader={backgroundFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}
