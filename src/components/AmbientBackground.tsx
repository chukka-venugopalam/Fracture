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

    // Drifting coordinates for soft aurora bands
    float slowTime = uTime * 0.05;
    
    // Band 1: Rose/Pink band moving diagonally
    vec2 p1 = uv * 2.2 + vec2(slowTime * 0.5, -slowTime * 0.35);
    float band1 = sin(uv.x * 1.5 + uv.y * 1.2 + slowTime * 0.8) * 0.5 + 0.5;
    band1 *= noise2d(p1);

    // Band 2: Cool Blue band moving counter-diagonally
    vec2 p2 = uv * 2.0 + vec2(-slowTime * 0.3, slowTime * 0.45);
    float band2 = cos(uv.x * 1.2 - uv.y * 1.8 - slowTime) * 0.5 + 0.5;
    band2 *= noise2d(p2);

    // Ambient radial falloff to keep edges dark and vignette-like
    float dist = distance(uv, vec2(0.5, 0.5));
    float falloff = clamp(1.0 - dist * 1.4, 0.0, 1.0);
    
    // Very subtle pastel pink and sky-blue glows to avoid competing with core
    vec3 baseSpaceBg = vec3(0.004, 0.004, 0.006);
    vec3 pinkGlow = vec3(0.075, 0.025, 0.045) * band1 * falloff;
    vec3 blueGlow = vec3(0.02, 0.05, 0.09) * band2 * falloff;
    
    vec3 finalColor = baseSpaceBg + pinkGlow + blueGlow;

    // Faint grain noise for organic texture and gradient banding prevention
    float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += vec3(grain * 0.003);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export default function AmbientBackground() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
    };
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
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
