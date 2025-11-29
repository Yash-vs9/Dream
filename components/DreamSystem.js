"use client";

import React, { useState, useRef, useEffect, useMemo, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useGLTF, Float, Sparkles, Cloud, Text, Environment, PerspectiveCamera, Stars, Instances, Instance, MeshDistortMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, ChromaticAberration, Vignette, Glitch, Scanline } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { GlitchMode, BlendFunction } from 'postprocessing';

// --- AUDIO ENGINE: GENERATIVE SOUNDSCAPE ---
// Creates real-time ambient music based on emotional state
class AudioEngine {
  constructor() {
    if (typeof window === 'undefined') return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.oscillators = [];
    this.gainNodes = [];
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.1; // Low ambient volume
  }

  playChord(mood) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    
    // Stop previous
    this.oscillators.forEach(osc => osc.stop());
    this.oscillators = [];

    // Mood scales
    const scales = {
      neutral: [261.63, 329.63, 392.00, 523.25], // C Major
      fear: [110.00, 123.47, 155.56, 196.00],    // Diminished / Dissonant
      joy: [349.23, 440.00, 523.25, 698.46],     // F Major (Uplifting)
      sadness: [220.00, 261.63, 329.63, 392.00]  // A Minor
    };

    const notes = scales[mood] || scales.neutral;
    const now = this.ctx.currentTime;

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = mood === 'fear' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      
      // Envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 2); // Slow attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 8); // Long decay

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 10);
      
      this.oscillators.push(osc);
    });
  }

  playBlip() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
}

// --- SHADER: ADVANCED VOLUMETRIC HOLOGRAM ---
const HologramMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#00ffff') },
    uGlitchStrength: { value: 0 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uGlitchStrength;
    
    // Simplex noise for vertex displacement
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
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
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vUv = uv;
      
      vec3 pos = position;
      
      // Glitch displacement
      float noiseVal = snoise(vec2(pos.y * 5.0, uTime * 2.0));
      pos.x += noiseVal * uGlitchStrength * 0.1;
      pos.z += noiseVal * uGlitchStrength * 0.05;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    
    void main() {
      // Fresnel Rim Light
      vec3 viewDir = normalize(cameraPosition - vPosition);
      float fresnel = pow(1.0 - dot(viewDir, vNormal), 2.0);
      
      // Digital Scanlines
      float scanline = sin(vPosition.y * 80.0 - uTime * 10.0) * 0.5 + 0.5;
      float grid = step(0.95, fract(vUv.x * 20.0)) + step(0.95, fract(vUv.y * 20.0));
      
      // Deep Data Noise
      float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      
      // Composition
      vec3 glowColor = uColor * (fresnel * 2.0);
      vec3 gridColor = vec3(1.0) * grid * 0.2;
      vec3 finalColor = glowColor + gridColor;
      
      // Pulse alpha
      float alpha = fresnel * 0.9 + (scanline * 0.1);
      alpha *= 0.8 + (sin(uTime * 3.0) * 0.1);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
};

// --- COMPONENT: MEMORY SHARDS (Floating Geometry) ---
function MemoryShards({ count = 15, mood }) {
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const particles = useMemo(() => {
    return new Array(count).fill().map(() => ({
      position: [
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 10
      ],
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0],
      scale: Math.random() * 0.5 + 0.2,
      speed: Math.random() * 0.2,
    }));
  }, [count]);

  useFrame((state) => {
    if (!mesh.current) return;
    
    particles.forEach((particle, i) => {
      const { position, rotation, scale, speed } = particle;
      
      // Orbit Logic
      const t = state.clock.elapsedTime * speed;
      
      dummy.position.set(
        position[0] + Math.sin(t) * 0.5,
        position[1] + Math.cos(t * 0.8) * 0.5,
        position[2]
      );
      dummy.rotation.set(
        rotation[0] + t,
        rotation[1] + t * 0.5,
        rotation[2]
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]}>
      <octahedronGeometry args={[1, 0]} />
      <meshPhysicalMaterial 
        color={mood === 'fear' ? '#500' : '#88c'} 
        roughness={0}
        metalness={0.8}
        transmission={0.6}
        thickness={2}
        wireframe={true}
      />
    </instancedMesh>
  );
}

// --- COMPONENT: THE ENTITY ---
function Entity({ mood, isTalking, entropy }) {
  const { scene, animations } = useGLTF("https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/RobotExpressive/RobotExpressive.glb");
  const mixer = useRef();
  const materialRef = useRef();

  const moodColor = useMemo(() => {
    switch (mood) {
      case 'fear': return '#ff0000'; 
      case 'joy': return '#ffaa00';
      case 'sadness': return '#4b0082';
      default: return '#00ffff';
    }
  }, [mood]);

  useEffect(() => {
    if (animations.length) {
      mixer.current = new THREE.AnimationMixer(scene);
      const animationName = mood === 'joy' ? 'Dance' : (isTalking ? 'Jump' : 'Idle');
      const clip = animations.find(c => c.name === animationName) || animations[0];
      const action = mixer.current.clipAction(clip);
      action.reset().fadeIn(0.5).play();
      
      return () => action.fadeOut(0.5);
    }
  }, [animations, mood, isTalking]);

  // Apply custom shader
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.ShaderMaterial({
          ...HologramMaterial,
          transparent: true,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        materialRef.current = child.material;
      }
    });
  }, [scene]);

  useFrame((state, delta) => {
    if (mixer.current) mixer.current.update(delta);
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uColor.value.lerp(new THREE.Color(moodColor), 0.05);
      // Glitch increases with entropy
      materialRef.current.uniforms.uGlitchStrength.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uGlitchStrength.value,
        isTalking ? 0.5 + entropy : entropy * 0.2,
        0.1
      );
    }
  });

  return (
    <group>
      <primitive object={scene} scale={0.5} position={[0, -1.5, 0]} />
      {/* Energy Core Light */}
      <pointLight 
        position={[0, 0, 0.5]} 
        color={moodColor} 
        intensity={2} 
        distance={3} 
        decay={2} 
      />
    </group>
  );
}

// --- MAIN SYSTEM CONTROLLER ---
export default function DreamSystem() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState("SYSTEM_BOOT... FRAGMENTED_MEMORY_LOADED.");
  const [mood, setMood] = useState('neutral');
  const [decay, setDecay] = useState(0); 
  const [isTalking, setIsTalking] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState([]); // Memory Fragments

  const audioEngine = useRef(null);

  useEffect(() => {
    audioEngine.current = new AudioEngine();
  }, []);

  const speak = (text) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    
    // Select Voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Google US English") || v.name.includes("Zira"));
    if (preferred) u.voice = preferred;

    u.pitch = mood === 'fear' ? 0.6 : (mood === 'joy' ? 1.2 : 1.0);
    u.rate = 0.95;
    
    u.onstart = () => setIsTalking(true);
    u.onend = () => setIsTalking(false);
    window.speechSynthesis.speak(u);
  };

  const analyze = (text) => {
    const t = text.toLowerCase();
    if (t.includes('fear') || t.includes('dark') || t.includes('scared') || t.includes('nightmare')) return 'fear';
    if (t.includes('joy') || t.includes('happy') || t.includes('light') || t.includes('love')) return 'joy';
    if (t.includes('sad') || t.includes('cry') || t.includes('lonely') || t.includes('lost')) return 'sadness';
    return 'neutral';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const newMood = analyze(input);
    setMood(newMood);
    audioEngine.current?.playBlip();
    audioEngine.current?.playChord(newMood);

    // Dynamic Story Generation
    let reply = "The static is too loud...";
    if (newMood === 'fear') reply = "I sense the void approaching. Hold onto the light.";
    else if (newMood === 'joy') reply = "This frequency... it feels like waking up.";
    else if (newMood === 'sadness') reply = "Tears are just data leaking from the soul.";
    else reply = "Processing new memory fragment. Integration complete.";

    setResponse("");
    typewriter(reply);
    speak(reply);
    
    // Add to history (Memory Shards)
    setHistory(prev => [...prev.slice(-4), { text: input, mood: newMood, id: Date.now() }]);
    setInput("");
    
    // Increase system entropy
    setDecay(prev => Math.min(prev + 0.1, 1.0)); 
  };

  const typewriter = (text) => {
    let i = 0;
    const interval = setInterval(() => {
      // 5% chance to insert a random glitch character
      const char = Math.random() > 0.95 ? "#" : text.charAt(i);
      setResponse(text.substring(0, i) + char);
      
      if (char === text.charAt(i)) i++;
      if (i > text.length) clearInterval(interval);
    }, 35);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-mono selection:bg-cyan-500/30">
      
      {/* --- 3D VIEWPORT --- */}
      <Canvas dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={45} />
        
        <Suspense fallback={null}>
          <Environment preset="city" />
          <ambientLight intensity={0.2} />

          {/* Drifting Camera */}
          <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
            <Entity mood={mood} isTalking={isTalking} entropy={decay} />
          </Float>

          {/* Procedural Environment */}
          <MemoryShards count={30} mood={mood} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          {/* Volumetric Atmosphere */}
          <Cloud position={[-8, -2, -10]} speed={0.2} opacity={0.2} />
          <Cloud position={[8, 2, -10]} speed={0.2} opacity={0.2} />

          {/* Cinematic Post-Processing */}
          <EffectComposer disableNormalPass>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.2} />
            <Noise opacity={0.05 + (decay * 0.1)} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
            {/* Chromatic Aberration spikes when talking */}
            <ChromaticAberration 
              offset={[
                THREE.MathUtils.lerp(0.001, 0.01, isTalking ? 1 : 0), 
                THREE.MathUtils.lerp(0.001, 0.005, isTalking ? 1 : 0)
              ]} 
            />
            {decay > 0.5 && <Glitch delay={[1.5, 3.5]} duration={[0.6, 1.0]} strength={[0.3, 1.0]} mode={GlitchMode.SPORADIC} />}
            <Scanline density={1.5} opacity={0.1} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      {/* --- HUD LAYER --- */}
      <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between z-10">
        
        {/* Top Bar */}
        <div className="flex justify-between items-start text-xs text-white/40 tracking-[0.2em]">
          <div className="flex flex-col gap-1">
            <span>NEURAL_LINK: <span className={mood === 'fear' ? 'text-red-500' : 'text-cyan-400'}>CONNECTED</span></span>
            <span>LATENCY: {Math.floor(Math.random() * 20) + 10}ms</span>
          </div>
          <div className="text-right">
             <div>ENTROPY: {(decay * 100).toFixed(1)}%</div>
             <div>ID: {Date.now().toString(16).toUpperCase()}</div>
          </div>
        </div>

        {/* Center Interaction Area */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl flex flex-col items-center">
          
          <AnimatePresence mode="wait">
            <motion.div 
              key={response}
              initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
              className="text-center mb-16 px-4"
            >
              <h1 className="text-3xl md:text-6xl font-extralight text-white/90 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)] leading-tight">
                {response}
              </h1>
            </motion.div>
          </AnimatePresence>

          {/* Liquid Glass Input */}
          <motion.form 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onSubmit={handleSubmit}
            className="pointer-events-auto w-full max-w-lg relative group"
          >
            <motion.div
              animate={{
                borderRadius: isFocused 
                  ? ["10px", "10px", "10px"] 
                  : ["40% 60% 70% 30% / 40% 50% 60% 50%", "60% 40% 30% 70% / 60% 30% 70% 40%", "40% 60% 70% 30% / 40% 50% 60% 50%"],
                boxShadow: isFocused 
                  ? `0 0 50px ${mood === 'fear' ? 'rgba(255,0,0,0.3)' : 'rgba(0,255,255,0.3)'}` 
                  : "0 0 0px rgba(0,0,0,0)"
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 bg-white/5 backdrop-blur-xl border border-white/10"
            />
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Inject data..."
              className="relative z-10 w-full bg-transparent p-6 text-center text-xl text-white placeholder-white/20 focus:outline-none font-light tracking-widest uppercase"
            />
          </motion.form>
        </div>

        {/* Memory Shards (History) */}
        <div className="flex gap-4 items-end h-20 pointer-events-none">
          {history.map((frag, i) => (
            <motion.div 
              key={frag.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 0.5, y: 0 }}
              className="text-[10px] bg-white/5 p-2 border-l-2 border-white/20 max-w-[150px] truncate"
            >
              <span className="opacity-50">MEM_{i}:</span> {frag.text}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Vignette Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,black_120%)] z-0" />
    </div>
  );
}