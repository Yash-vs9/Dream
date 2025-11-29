"use client";

import React, { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Float } from "@react-three/drei";
import * as THREE from "three";

export function JoiCharacter({ isIdle, mood, talking }) {
  // ✅ PERMANENT FIX: Using jsDelivr CDN for the official Three.js Robot
  // This link is stable and will not 404.
  const url = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/RobotExpressive/RobotExpressive.glb";
  
  const { scene, animations } = useGLTF(url);
  const group = useRef();
  const lightRef = useRef();
  const mixer = useRef();

  // --- ANIMATION SETUP ---
  useEffect(() => {
    if (animations && scene) {
      mixer.current = new THREE.AnimationMixer(scene);
      // Play the "Idle" or "Wave" animation if available
      const action = mixer.current.clipAction(animations[0]);
      action.play();
    }
  }, [animations, scene]);

  // --- MOOD LIGHTING ---
  const getLightColor = () => {
    switch (mood) {
      case 'lonely': return "#8A2BE2"; // Purple
      case 'anger': return "#FF0000";  // Red
      case 'joy': return "#FFD700";    // Gold
      default: return "#00BFFF";       // Cyan
    }
  };

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    
    // Update internal animations (like waving/walking)
    if (mixer.current) mixer.current.update(delta);

    if (group.current) {
      // 1. Idle Floating
      group.current.position.y = Math.sin(t * 1) * 0.1 - 2; 

      // 2. Talking Animation (Wiggle)
      if (talking) {
        group.current.rotation.y = Math.sin(t * 15) * 0.05; 
        group.current.rotation.x = Math.sin(t * 20) * 0.02; 
      } else {
        group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, 0, 0.1);
        group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0, 0.1);
      }
    }
    
    // 3. Mood Light Transition
    if (lightRef.current) {
        lightRef.current.color.lerp(new THREE.Color(getLightColor()), 0.05);
    }
  });

  return (
    <group>
        <pointLight ref={lightRef} position={[2, 3, 4]} intensity={20} distance={10} decay={1} />
        <ambientLight intensity={0.5} />
        
        <Float 
          speed={isIdle ? 2 : 5} 
          rotationIntensity={isIdle ? 0.2 : 0} 
          floatIntensity={isIdle ? 1 : 0.5}
        >
            <primitive 
                object={scene} 
                ref={group} 
                scale={0.5} /* Robot is large, scale down */
                position={[0, -1, 0]} 
            />
        </Float>
    </group>
  );
}

// ✅ Preload the stable URL
useGLTF.preload("https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/RobotExpressive/RobotExpressive.glb");