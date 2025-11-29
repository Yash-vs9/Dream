"use client";

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Vertex Shader
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment Shader (Ashima Simplex Noise)
const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    float noiseFlow = snoise(vUv * 3.0 + uTime * 0.1);
    vec2 distortedUv = vUv + noiseFlow * 0.1;
    float n1 = snoise(distortedUv * 2.0 + uTime * 0.1);
    float n2 = snoise(distortedUv * 4.0 - uTime * 0.2);
    float fluid = smoothstep(0.2, 0.8, n1 * 0.5 + n2 * 0.5 + 0.5);
    vec3 color = mix(uColorA, uColorB, fluid);
    
    // Vignette
    float dist = distance(vUv, vec2(0.5));
    color *= 1.0 - dist * 0.8;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export default function LiquidBackground({ mood }) {
  const mesh = useRef();

  const palettes = useMemo(() => ({
    lonely: { a: new THREE.Color('#1a0b2e'), b: new THREE.Color('#4338ca') }, // Deep Void -> Indigo
    anger:  { a: new THREE.Color('#450a0a'), b: new THREE.Color('#b91c1c') }, // Blood -> Red
    joy:    { a: new THREE.Color('#f59e0b'), b: new THREE.Color('#ec4899') }, // Amber -> Pink
    neutral:{ a: new THREE.Color('#020617'), b: new THREE.Color('#1e1b4b') }, // Black -> Navy
  }), []);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.material.uniforms.uTime.value = state.clock.getElapsedTime();
      const target = palettes[mood] || palettes.neutral;
      mesh.current.material.uniforms.uColorA.value.lerp(target.a, 0.02);
      mesh.current.material.uniforms.uColorB.value.lerp(target.b, 0.02);
    }
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color('#000000') },
    uColorB: { value: new THREE.Color('#000000') },
  }), []);

  return (
    <mesh ref={mesh} scale={[15, 15, 1]} position={[0, 0, -5]}>
      <planeGeometry args={[2, 2, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
      />
    </mesh>
  );
}