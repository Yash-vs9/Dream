"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, Html, MeshDistortMaterial, Sphere, Stars, Sparkles as DreiSparkles, Float } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, XCircle, Mic, Play, Loader2, Sparkles, Wand2, CloudRain, Flower, HelpCircle } from "lucide-react";

/**
 * CONFIG
 */
const VRM_URL = "/model/6441211855445306245.vrm";

const SYSTEM_PROMPT = `
You are Lumina, a Dream Fairy.
Voice: Soft, whispery, magical.
Persona: You guide travelers through their own subconscious.
Emotions: You reflect the user's emotion. If they are scared, be protective. If happy, be radiant.
Style: Speak in friendly voice as if you are her friend. Max 2 sentences.
`;

// --- EMOTION PALETTES (UPDATED) ---
const MOODS = {
  neutral: { color: "#a855f7", intensity: 0.5, type: 'clear' },
  calm: { color: "#38bdf8", intensity: 0.3, type: 'clear' },
  fear: { color: "#ef4444", intensity: 0.8, type: 'clear' },
  frustrated: { color: "#f97316", intensity: 0.7, type: 'clear' },
  excitement: { color: "#e879f9", intensity: 0.9, type: 'flowers' },
  // ADDED NEW MOODS
  happy: { color: "#f472b6", intensity: 0.8, type: 'flowers' },
  sad: { color: "#64748b", intensity: 0.4, type: 'rain' },
  confused: { color: "#a3a3a3", intensity: 0.5, type: 'blur' }
};

/**
 * --- WEATHER EFFECTS (NEW) ---
 */
function WeatherEffects({ mood }) {
    const { type } = MOODS[mood] || MOODS.neutral;
    // Determine particle count based on mood type
    const count = (type === 'rain' ? 800 : (type === 'flowers' ? 150 : 0));
    
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Generate random particle data
    const particles = useMemo(() => new Array(800).fill(0).map(() => ({
        x: (Math.random() - 0.5) * 20, y: Math.random() * 20, z: (Math.random() - 0.5) * 20,
        speed: Math.random() * 0.1 + 0.05, spin: Math.random() * 0.05, offset: Math.random() * 100
    })), []);

    useFrame((state) => {
        if (!meshRef.current || count === 0) return;
        particles.forEach((p, i) => {
            if (i >= count) return; 

            // Physics Logic
            if (type === 'rain') {
                p.y -= p.speed * 4; // Rain falls fast
            } else { 
                p.y -= p.speed * 0.5; // Flowers float
                p.x += Math.sin(state.clock.elapsedTime + p.offset) * 0.01; 
            }

            // Loop particles to top
            if (p.y < -5) { p.y = 10; p.x = (Math.random() - 0.5) * 20; }
            
            dummy.position.set(p.x, p.y, p.z);
            
            // Visual Styles
            if (type === 'flowers') { 
                dummy.rotation.x += p.spin; dummy.scale.set(0.3, 0.3, 0.3); 
            } else { 
                dummy.rotation.set(0,0,0); dummy.scale.set(0.05, 0.8, 0.05); 
            }
            
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (count === 0) return null;
    return (
        <instancedMesh ref={meshRef} args={[null, null, count]}>
            {type === 'flowers' ? <dodecahedronGeometry args={[0.2, 0]} /> : <cylinderGeometry args={[0.05, 0.05, 1]} />}
            <meshStandardMaterial 
                color={type === 'flowers' ? '#fbcfe8' : '#a5f3fc'} 
                emissive={type === 'flowers' ? '#f472b6' : '#bae6fd'}
                transparent opacity={0.6} 
            />
        </instancedMesh>
    );
}

/**
 * --- API HELPERS (ORIGINAL PRESERVED) ---
 */
const callGeminiText = async (apiKey, history, message) => {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) throw new Error("No API key");
  
  const prompt = {
    contents: [
      ...(history || []).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.content }] })),
      { role: "user", parts: [{ text: message }] }
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: { maxOutputTokens: 100, temperature: 1.3 }
  };
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cleanKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prompt)
  });
  
  if (!res.ok) {
     const err = await res.json();
     throw new Error(err.error?.message || "Gemini API Error");
  }
  return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "I am listening...";
};

const callGoogleTTS = async (apiKey, text, mood) => {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) throw new Error("No Key");

  // Base settings — fairy softness
  let pitchVal = 3.5;  
  let rateVal = 0.90;
  let style = "soft";
  let moodTag = "";

  // Mood modifiers
  if (mood === "fear") { 
    pitchVal = 2.5; rateVal = 0.97; style = "whispered"; moodTag = `<break time="150ms"/>`;
  }
  if (mood === "excitement" || mood === "happy") {
    pitchVal = 4.0; rateVal = 1.08; style = "lively"; moodTag = `<break time="80ms"/>`;
  }
  if (mood === "sad") {
    pitchVal = 2.0; rateVal = 0.82; style = "sad"; moodTag = `<break time="200ms"/>`;
  }

  const ssml = `
    <speak>
      <voice name="en-US-Neural2-F">
        <prosody rate="${rateVal}" pitch="${pitchVal}st">
          <amazon:effect name="soften">
            ${moodTag}
            ${text}
          </amazon:effect>
        </prosody>
      </voice>
    </speak>
  `;

  const payload = {
    input: { ssml },
    voice: { languageCode: "en-US", name: "en-US-Neural2-F" },
    audioConfig: { audioEncoding: "MP3", speakingRate: rateVal, pitch: pitchVal, effectsProfileId: ["headphone-class-device"] }
  };

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(cleanKey)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );

  if (!res.ok) throw new Error("Google TTS Failed");
  const data = await res.json();
  const binaryString = window.atob(data.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  return URL.createObjectURL(new Blob([bytes.buffer], { type: "audio/mpeg" }));
};

const speakNativeBrowser = (text, onEnd) => {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.pitch = 1.4;
  utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
};

const analyzeSentiment = (text) => {
    const t = text.toLowerCase();
    if (t.match(/(scared|dark|nightmare|run|shadow|fear)/)) return 'fear';
    if (t.match(/(angry|stuck|annoyed|why|hate|broken)/)) return 'frustrated';
    if (t.match(/(wow|yay|love|amazing|fly|magic|star)/)) return 'happy';
    if (t.match(/(sad|cry|lonely|tears|miss)/)) return 'sad';
    if (t.match(/(weird|confused|what|dizzy)/)) return 'confused';
    if (t.match(/(calm|sleep|peace|quiet|rest|hello)/)) return 'calm';
    return 'neutral';
};

/**
 * --- 3D BACKGROUND (UPDATED) ---
 */
function DreamAtmosphere({ mood }) {
  const currentMood = MOODS[mood] || MOODS.neutral;
  
  // ADDED: Camera Shake/Dizzy logic for Confused mood
  useFrame((state) => {
      if (mood === 'confused') {
          const t = state.clock.elapsedTime;
          state.camera.rotation.z = THREE.MathUtils.lerp(state.camera.rotation.z, Math.sin(t * 0.5) * 0.05, 0.05);
      } else {
          state.camera.rotation.z = THREE.MathUtils.lerp(state.camera.rotation.z, 0, 0.05);
      }
  });

  return (
    <group>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} color={currentMood.color} />
      <pointLight position={[-5, -2, -5]} intensity={2} color="#ffffff" />
      
      {/* ADDED: Fog for atmosphere */}
      <fog attach="fog" args={[mood === 'confused' ? '#1a1a1a' : '#000000', 2, mood === 'confused' ? 12 : 30]} />

      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <DreiSparkles count={150} scale={15} size={3} speed={0.4} opacity={0.5} color={currentMood.color} />
      
      {/* ADDED: Weather System */}
      <WeatherEffects mood={mood} />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <Sphere args={[1, 32, 32]} position={[-3, 2, -5]}>
            <MeshDistortMaterial color={currentMood.color} speed={2} distort={0.5} transparent opacity={0.3} />
        </Sphere>
        <Sphere args={[1.5, 32, 32]} position={[4, -2, -8]}>
            <MeshDistortMaterial color="#ffffff" speed={1.5} distort={0.4} transparent opacity={0.2} />
        </Sphere>
      </Float>
    </group>
  );
}

/**
 * --- AVATAR CONTROLLER (YOUR ORIGINAL LOGIC PRESERVED) ---
 */
function Avatar({ url, onLoaded, setVrmRef, isSpeaking, mood }) {
  const { scene, camera } = useThree(); // Added camera here for your FOV logic
  const gltf = useLoader(GLTFLoader, url, loader => loader.register(parser => new VRMLoaderPlugin(parser)));
  
  const animState = useRef({
      armRotL: 1.3, armRotR: 1.3, foreArmRot: 0.1, handRot: 0, hipBob: 0, hipTwist: 0, breath: 0
  });

  useEffect(() => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;
    VRMUtils.combineSkeletons(vrm.scene);
    
    vrm.scene.traverse(o => {
        if(o.isMesh && o.material) {
            o.material.transparent = true;
            o.material.alphaTest = 0.5;
            o.material.depthWrite = true;
        }
    });

    vrm.scene.rotation.y = Math.PI;
    vrm.scene.position.set(0, 0.3, 0);

    scene.add(vrm.scene);
    setVrmRef(vrm);
    if (onLoaded) onLoaded(vrm);

    return () => { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); };
  }, [gltf, scene, setVrmRef, onLoaded]);

  // --- PROCEDURAL ANIMATION ENGINE (YOUR EXACT LOGIC) ---
  useFrame(({ clock }) => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;
    vrm.update(clock.getDelta());
    const t = clock.getElapsedTime();

    // Helper: Composite Sine Waves for Organic Noise
    const organicNoise = (offset, speed = 1) => {
        return Math.sin(t * speed + offset) * 0.5 + Math.sin(t * speed * 0.5 + offset * 2) * 0.3 + Math.sin(t * speed * 0.2 + offset) * 0.2;
    };

    const s = animState.current;
    const lerp = THREE.MathUtils.lerp;

    // -- BONE REFERENCES --
    const hips = vrm.humanoid.getRawBoneNode("hips");
    const spine = vrm.humanoid.getRawBoneNode("spine");
    const neck = vrm.humanoid.getRawBoneNode("neck");
    const lArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rArm = vrm.humanoid.getRawBoneNode("rightUpperArm");
    const lForeArm = vrm.humanoid.getRawBoneNode("leftLowerArm");
    const rForeArm = vrm.humanoid.getRawBoneNode("rightLowerArm");
    const lHand = vrm.humanoid.getRawBoneNode("leftHand");
    const rHand = vrm.humanoid.getRawBoneNode("rightHand");
    const lLeg = vrm.humanoid.getRawBoneNode("leftUpperLeg");
    const rLeg = vrm.humanoid.getRawBoneNode("rightUpperLeg");
    // Added Shoulder references used in your code
    const lShoulder = vrm.humanoid.getRawBoneNode("leftShoulder");
    const rShoulder = vrm.humanoid.getRawBoneNode("rightShoulder");

    // 1. DEEP BREATHING (Spine & Neck)
    if(spine) {
        const breath = (Math.sin(t * 1.5) + Math.sin(t * 0.5)) * 0.02;
        spine.rotation.x = breath; 
        spine.rotation.y = organicNoise(0, 0.3) * 0.05; 
        // ADDED: Mood Posture Overlay (Subtle)
        if(mood === 'sad') spine.rotation.x += 0.2; 
    }
    if(neck) {
        neck.rotation.y = organicNoise(5, 0.4) * 0.1;
        neck.rotation.x = Math.sin(t * 0.5) * 0.03;
        // ADDED: Confused Head Tilt
        if(mood === 'confused') neck.rotation.z = Math.sin(t) * 0.1;
    }
    
    // 2. LEGS (Floating/Treading Air)
    if(lLeg && rLeg) {
        lLeg.rotation.x = Math.sin(t * 1.5) * 0.1;
        rLeg.rotation.x = -Math.sin(t * 1.5) * 0.1;
        lLeg.rotation.z = 0.1;
        rLeg.rotation.z = -0.1;
    }

    // 3. TARGET CALCULATIONS (YOUR EXACT LOGIC)
    let tArmL, tArmR, tForeArm, tHand, tBob, tTwist;

    if (isSpeaking) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, 55, 0.05);
      camera.updateProjectionMatrix();
  
      tArmL = 0.8 + organicNoise(1, 3, 0.3); 
      tArmR = -0.9 - organicNoise(2, 2.8, 0.3);
      tForeArm = 0.3 + Math.abs(organicNoise(3, 4, 0.4));
      tHand = organicNoise(4, 10, 0.4);
      tBob = organicNoise(5, 1.5, 0.03) + Math.sin(t * 2) * 0.01;
      tTwist = organicNoise(6, 1.2, 0.08);
  
      if (lShoulder) lShoulder.rotation.z = organicNoise(7, 2, 0.15);
      if (rShoulder) rShoulder.rotation.z = -organicNoise(8, 2, 0.15);
      if (spine) spine.rotation.x = -0.05 + organicNoise(9, 1, 0.02);
  } 
  else {
        camera.fov = THREE.MathUtils.lerp(camera.fov, 30, 0.05);
        camera.updateProjectionMatrix();
        
        tArmL = 1.3 + organicNoise(0.1, 0.5) * 0.05; 
        tArmR = -1.3 - organicNoise(0.2, 0.6) * 0.05;
        tForeArm = 0.1 + Math.abs(Math.sin(t * 0.5)) * 0.5; 
        tHand = organicNoise(10, 2) * 0.5;
        tBob = Math.sin(t * 1) * 0.01;
        tTwist = organicNoise(100, 0.2) * 0.3;
    }

    // 4. SMOOTH INTERPOLATION
    s.armRotL = lerp(s.armRotL, tArmL, 0.05);
    s.armRotR = lerp(s.armRotR, tArmR, 0.05);
    s.foreArmRot = lerp(s.foreArmRot, tForeArm, 0.05);
    s.handRot = lerp(s.handRot, tHand, 0.1);
    s.hipBob = lerp(s.hipBob, tBob, 0.4);
    s.hipTwist = lerp(s.hipTwist, tTwist, 0.1);

    // 5. APPLY
    if(hips) { hips.position.y = s.hipBob; hips.rotation.y = s.hipTwist; }
    if(lArm) lArm.rotation.z = s.armRotL;
    if(rArm) rArm.rotation.z = s.armRotR;
    if(lForeArm) lForeArm.rotation.z = s.foreArmRot;
    if(rForeArm) rForeArm.rotation.z = -s.foreArmRot;
    if(lHand) lHand.rotation.x = s.handRot;
    if(rHand) rHand.rotation.x = s.handRot;
  });

  return null;
}

/**
 * --- FACE CONTROLLER (UPDATED FOR EMOTIONS) ---
 */
function FaceController({ vrm, analyser, mood }) {
    const { mouse } = useThree();
    useFrame(() => {
        if(!vrm) return;

        // Head Look
        const head = vrm.humanoid?.getRawBoneNode("head");
        if(head) {
            head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, mouse.x * 0.4, 0.05);
            head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, mouse.y * 0.2, 0.05);
        }

        // Random Blinking
        if(Math.random() < 0.005) {
            vrm.expressionManager.setValue('blink', 1);
            setTimeout(() => vrm.expressionManager.setValue('blink', 0), 150);
        }

        // --- EMOTION LOGIC ---
        const mgr = vrm.expressionManager;
        // Reset all first
        mgr.setValue('happy', 0); mgr.setValue('angry', 0); mgr.setValue('surprised', 0); mgr.setValue('sad', 0);

        // Apply Mood
        if(mood === 'excitement' || mood === 'happy' || mood === 'calm') mgr.setValue('happy', 0.6);
        if(mood === 'fear' || mood === 'confused') mgr.setValue('surprised', 0.5);
        if(mood === 'frustrated') mgr.setValue('angry', 0.4);
        if(mood === 'sad') mgr.setValue('sad', 0.7);

        // Lip Sync
        if(analyser) {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for(let i=0; i<data.length; i++) {
                const v = (data[i] - 128) / 128;
                sum += v*v;
            }
            const vol = Math.sqrt(sum / data.length);
            const open = THREE.MathUtils.clamp(vol * 20, 0, 1);
            
            mgr.setValue('aa', open);
            mgr.setValue('ih', open * 0.5);
            mgr.setValue('oh', open * 0.3);
        } else {
            mgr.setValue('aa', 0);
        }
    });
    return null;
}

/**
 * --- BACKGROUND BLOBS (Organic UI) ---
 */
function BackgroundBlobs({ mood }) {
    const color = MOODS[mood]?.color || MOODS.neutral.color;
    
    return (
        <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none transition-all duration-1000">
            {/* Animated Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-black transition-colors duration-1000 ${mood === 'sad' ? 'grayscale' : ''}`} />
            
            {/* Organic Floating Blobs */}
            <motion.div 
                animate={{ x: [0, 100, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-40 mix-blend-screen transition-colors duration-1000"
                style={{ backgroundColor: color }}
            />
             <motion.div 
                animate={{ x: [0, -100, 0], y: [0, 100, 0], scale: [1, 1.5, 1] }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] opacity-30 mix-blend-screen transition-colors duration-1000"
                style={{ backgroundColor: color === '#ef4444' ? '#7f1d1d' : '#4c1d95' }}
            />
        </div>
    );
}

/**
 * --- MAIN APPLICATION ---
 */
export default function DreamApp() {
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [vrmRef, setVrmRef] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Click to Enter Dream");
  const [audioReady, setAudioReady] = useState(false);
  const [mood, setMood] = useState('neutral');
  const [lastInteraction, setLastInteraction] = useState(0);

  const audioContextRef = useRef(null);
  const audioElementRef = useRef(null);
  const analyserRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("dreamApiKey");
    if(stored) try { setApiKey(JSON.parse(stored)); } catch {}
  }, []);

  // --- SILENCE/EMOTION TIMER LOGIC (NEW) ---
  useEffect(() => {
      if(!audioReady || isSpeaking) return;
      
      const interval = setInterval(() => {
          const elapsed = Date.now() - lastInteraction;
          
          if (elapsed > 20000 && mood !== 'confused') {
              setMood('confused'); setStatus("Lumina is confused...");
          } else if (elapsed > 10000 && elapsed < 20000 && mood !== 'sad') {
              setMood('sad'); setStatus("Lumina feels lonely...");
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [audioReady, isSpeaking, mood, lastInteraction]);

  const initAudio = useCallback(() => {
    if(audioContextRef.current) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    
    audioContextRef.current = ctx;
    audioElementRef.current = audio;
    analyserRef.current = analyser;
    setAudioReady(true);
    setLastInteraction(Date.now());
    setStatus("Idle");
  }, []);

  const handleSpeak = useCallback(async (text) => {
    if(!apiKey) return;
    if(!audioContextRef.current) initAudio();
    if(audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

    // Reset interaction timer & Mood
    setLastInteraction(Date.now());
    const detectedMood = analyzeSentiment(text);
    
    // Override sentiment if just "talking" to default to happy/friendly interaction
    const finalMood = detectedMood === 'neutral' ? 'happy' : detectedMood;
    setMood(finalMood);
    
    setStatus("Dreaming...");
    setIsSpeaking(true);
    historyRef.current.push({ role: "user", content: text });

    try {
      const reply = await callGeminiText(apiKey, historyRef.current, text);
      historyRef.current.push({ role: "model", content: reply });
      setStatus("Whispering...");

      try {
          const audioUrl = await callGoogleTTS(apiKey, reply, finalMood);
          if(audioUrl && audioElementRef.current) {
             const audio = audioElementRef.current;
             audio.src = audioUrl;
             audio.oncanplay = async () => { try { await audio.play(); } catch(e) {} };
             audio.onended = () => { 
                setIsSpeaking(false); 
                setStatus("Idle"); 
                setLastInteraction(Date.now()); // Reset timer again after finish
             };
          }
      } catch (e) {
          console.warn("Fallback TTS");
          speakNativeBrowser(reply, () => { setIsSpeaking(false); setStatus("Idle"); setLastInteraction(Date.now()); });
      }
    } catch(e) {
        console.error(e);
        setStatus("Error");
        setIsSpeaking(false);
    }
  }, [apiKey, initAudio]);

  const startListening = () => {
    if(!audioContextRef.current) initAudio();
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!Rec) { handleSpeak("Hello."); return; }
    const r = new Rec();
    r.onstart = () => setStatus("Listening...");
    r.onresult = (e) => handleSpeak(e.results[0][0].transcript);
    r.start();
  };

  if(!mounted) return <div className="h-screen w-full bg-black flex items-center justify-center text-white">Loading Dream...</div>;

  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-sans" onClick={() => !audioReady && initAudio()}>
      
      {/* Background with Emotion State */}
      <BackgroundBlobs mood={mood} />

      {/* CONFUSED BLUR OVERLAY */}
      <AnimatePresence>
        {mood === 'confused' && (
            <motion.div 
                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
                exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                transition={{ duration: 1.5 }}
                className="absolute inset-0 z-20 pointer-events-none bg-black/10"
            />
        )}
      </AnimatePresence>

      <Canvas camera={{ position: [0, 1.25, 3.5], fov: 30 }}>
         {/* Atmosphere passed mood for Weather/Fog */}
         <DreamAtmosphere mood={mood} />
         <Suspense fallback={<Html center><div className="animate-pulse tracking-widest text-xs">SUMMONING LUMINA...</div></Html>}>
            <Avatar url={VRM_URL} setVrmRef={setVrmRef} isSpeaking={isSpeaking} mood={mood} />
            {vrmRef && <FaceController vrm={vrmRef} analyser={analyserRef.current} mood={mood} />}
         </Suspense>
         <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={Math.PI/2} minPolarAngle={Math.PI/2.5} />
      </Canvas>

      {/* --- FLUID GLASS UI --- */}
      <motion.div 
         initial={{ y: 100, opacity: 0 }} 
         animate={{ y: 0, opacity: 1, filter: mood === 'confused' ? 'blur(4px)' : 'blur(0px)' }} 
         transition={{ type: "spring", stiffness: 100, damping: 20 }}
         className="absolute bottom-8 left-0 right-0 flex justify-center z-50 px-4"
      >
        <div className="w-full max-w-lg backdrop-blur-2xl bg-white/5 border border-white/10 rounded-[3rem] p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] transition-all duration-500"
             style={{ boxShadow: `0 0 40px ${MOODS[mood].color}20` }}>
            
            {/* Status Pill */}
            <div className="flex justify-center mb-4">
                <div className="px-4 py-1 rounded-full bg-black/20 text-[10px] font-bold tracking-[0.2em] uppercase flex items-center gap-2 text-white/80">
                    {mood === 'sad' && <CloudRain size={12} />}
                    {mood === 'happy' && <Flower size={12} />}
                    {mood === 'confused' && <HelpCircle size={12} />}
                    {isSpeaking && <Sparkles className="animate-spin w-3 h-3 text-yellow-200"/>}
                    {status}
                </div>
            </div>

            {!apiKey ? (
                <div className="space-y-3 p-2">
                    <input type="password" placeholder="Enter Google Cloud API Key" 
                        className="w-full bg-transparent border-b border-white/20 pb-2 text-center focus:outline-none placeholder:text-white/30 text-sm transition-colors focus:border-white/50"
                        onChange={e => { setApiKey(e.target.value); localStorage.setItem("dreamApiKey", JSON.stringify(e.target.value)); }} />
                </div>
            ) : !audioReady ? (
                <button onClick={initAudio} className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-full font-bold flex items-center justify-center gap-2 transition group">
                    <Wand2 size={18} className="group-hover:rotate-12 transition"/> Awaken Dream
                </button>
            ) : (
                <div className="flex gap-3">
                    <button onClick={startListening} className="flex-1 h-14 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-[2rem] flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-lg relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition duration-300 rounded-[2rem]"></div>
                        <Mic size={24} className="relative z-10" />
                    </button>
                    
                    <div className="flex flex-col gap-1 justify-center">
                        <button onClick={() => handleSpeak("I feel cold and scared in the dark.")} className="px-4 py-1.5 rounded-full border border-red-500/30 hover:bg-red-500/20 text-[10px] transition text-red-200">
                            Fear
                        </button>
                        <button onClick={() => handleSpeak("The world is so beautiful and full of light!")} className="px-4 py-1.5 rounded-full border border-pink-500/30 hover:bg-pink-500/20 text-[10px] transition text-pink-200">
                            Joy
                        </button>
                    </div>
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
}