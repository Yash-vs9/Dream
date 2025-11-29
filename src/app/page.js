"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, Html, MeshDistortMaterial, Sphere, Stars, Sparkles as DreiSparkles, Float } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, XCircle, Mic, Play, Loader2, Sparkles, Wand2 } from "lucide-react";

/**
 * CONFIG
 */
const VRM_URL = "/model/6441211855445306245.vrm";

const SYSTEM_PROMPT = `
You are Lumina, a Dream Fairy.
Voice: Soft, whispery, magical.
Persona: You guide travelers through their own subconscious.
Emotions: You reflect the user's emotion. If they are scared, be protective. If happy, be radiant.
Style: Speak in metaphors of light, stars, and water. Max 2 sentences.
`;

// --- EMOTION PALETTES ---
const MOODS = {
  neutral: { color: "#a855f7", intensity: 0.5 }, // Purple
  calm: { color: "#38bdf8", intensity: 0.3 },    // Cyan
  fear: { color: "#ef4444", intensity: 0.8 },    // Red
  frustrated: { color: "#f97316", intensity: 0.7 }, // Orange
  excitement: { color: "#e879f9", intensity: 0.9 } // Pink
};

/**
 * --- API HELPERS ---
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
  
  let pitch = 2.0;
  let rate = 0.95;
  if (mood === 'fear') { pitch = 0.8; rate = 1.1; }
  if (mood === 'excitement') { pitch = 2.4; rate = 1.1; }

  const payload = {
    input: { text: text },
    voice: { languageCode: "en-US", name: "en-US-Journey-F" }, 
    audioConfig: { audioEncoding: "MP3", speakingRate: rate, pitch: pitch } 
  };
  
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(cleanKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  
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
    if (t.match(/(wow|yay|love|amazing|fly|magic|star)/)) return 'excitement';
    if (t.match(/(calm|sleep|peace|quiet|rest|hello)/)) return 'calm';
    return 'neutral';
};

/**
 * --- 3D BACKGROUND ---
 */
function DreamAtmosphere({ mood }) {
  const currentMood = MOODS[mood] || MOODS.neutral;
  
  return (
    <group>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} color={currentMood.color} />
      <pointLight position={[-5, -2, -5]} intensity={2} color="#ffffff" />
      
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <DreiSparkles count={150} scale={15} size={3} speed={0.4} opacity={0.5} color={currentMood.color} />
      
      {/* Floating Orbs for "Dream" feel */}
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
 * --- AVATAR CONTROLLER (THE SOUL) ---
 */
function Avatar({ url, onLoaded, setVrmRef, isSpeaking, mood }) {
  const { scene } = useThree();
  const gltf = useLoader(GLTFLoader, url, loader => loader.register(parser => new VRMLoaderPlugin(parser)));

  useEffect(() => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;
    VRMUtils.combineSkeletons(vrm.scene);
    
    // Fix transparency
    vrm.scene.traverse(o => {
        if(o.isMesh && o.material) {
            o.material.transparent = true;
            o.material.alphaTest = 0.5;
            o.material.depthWrite = true;
        }
    });

    vrm.scene.rotation.y = Math.PI;
    vrm.scene.position.set(0, -1.3, 0);

    scene.add(vrm.scene);
    setVrmRef(vrm);
    if (onLoaded) onLoaded(vrm);

    return () => {
      scene.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
    };
  }, [gltf, scene, setVrmRef, onLoaded]);

  // --- PROCEDURAL ANIMATION ENGINE ---
  useFrame(({ clock }) => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;
    vrm.update(clock.getDelta());
    const t = clock.getElapsedTime();

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

    // Helper for smooth interpolation
    const lerp = (current, target, speed = 0.1) => THREE.MathUtils.lerp(current, target, speed);

    // -- 1. ALIVE BREATHING (Always Active) --
    if(spine) {
        spine.rotation.x = Math.sin(t * 2) * 0.04; 
        spine.rotation.y = Math.sin(t * 0.7) * 0.03;
    }
    
    // -- 2. FLOATING / WALKING MOTION (Legs & Hips) --
    // Even when idle, she floats and kicks legs slightly
    if(hips) {
        hips.position.y = Math.sin(t * 3) * 0.05 + 0.02; // Bob up/down
        hips.rotation.y = Math.sin(t * 0.5) * 0.05; // Slow twists
    }
    if(lLeg && rLeg) {
        // Treading air
        lLeg.rotation.x = lerp(lLeg.rotation.x, Math.sin(t * 3) * 0.1, 0.1);
        rLeg.rotation.x = lerp(rLeg.rotation.x, -Math.sin(t * 3) * 0.1, 0.1);
    }

    // -- 3. STATE MACHINE: SPEAKING vs IDLE --
    if (isSpeaking) {
        // --- SPEAKING GESTURES ---
        
        // Lift arms to chest height (Expressive)
        if(lArm) lArm.rotation.z = lerp(lArm.rotation.z, (Math.PI / 4) + Math.sin(t * 3) * 0.1, 0.05);
        if(rArm) rArm.rotation.z = lerp(rArm.rotation.z, -(Math.PI / 4) - Math.cos(t * 3) * 0.1, 0.05);
        
        // Bend elbows inward
        if(lForeArm) lForeArm.rotation.z = lerp(lForeArm.rotation.z, 0.5 + Math.sin(t*4)*0.1, 0.1);
        if(rForeArm) rForeArm.rotation.z = lerp(rForeArm.rotation.z, -0.5 - Math.cos(t*4)*0.1, 0.1);

        // Active Hands
        if(lHand) lHand.rotation.x = Math.sin(t * 8) * 0.3;
        if(rHand) rHand.rotation.x = Math.cos(t * 8) * 0.3;

    } else {
        // --- IDLE STATE (Arms Down, Relaxed) ---
        
        // Target: Arms ~75 degrees down (1.3 radians)
        const idleArmZ = 1.3; 

        if(lArm) lArm.rotation.z = lerp(lArm.rotation.z, idleArmZ + Math.sin(t)*0.03, 0.05);
        if(rArm) rArm.rotation.z = lerp(rArm.rotation.z, -idleArmZ - Math.sin(t)*0.03, 0.05);
        
        // Straighten forearms naturally
        if(lForeArm) lForeArm.rotation.z = lerp(lForeArm.rotation.z, 0.1, 0.1);
        if(rForeArm) rForeArm.rotation.z = lerp(rForeArm.rotation.z, -0.1, 0.1);

        // Relax hands
        if(lHand) lHand.rotation.x = lerp(lHand.rotation.x, 0, 0.1);
        if(rHand) rHand.rotation.x = lerp(rHand.rotation.x, 0, 0.1);
    }
  });

  return null;
}

/**
 * --- FACE CONTROLLER ---
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

        // Emotions
        const mgr = vrm.expressionManager;
        mgr.setValue('happy', 0); mgr.setValue('angry', 0); mgr.setValue('surprised', 0);

        if(mood === 'excitement' || mood === 'calm') mgr.setValue('happy', 0.4);
        if(mood === 'fear') mgr.setValue('surprised', 0.5);
        if(mood === 'frustrated') mgr.setValue('angry', 0.4);

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
        <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
            {/* Animated Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-black transition-colors duration-1000" />
            
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

  const audioContextRef = useRef(null);
  const audioElementRef = useRef(null);
  const analyserRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("dreamApiKey");
    if(stored) try { setApiKey(JSON.parse(stored)); } catch {}
  }, []);

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
    setStatus("Idle");
  }, []);

  const handleSpeak = useCallback(async (text) => {
    if(!apiKey) return;
    if(!audioContextRef.current) initAudio();
    if(audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

    const detectedMood = analyzeSentiment(text);
    setMood(detectedMood);
    
    setStatus("Dreaming...");
    setIsSpeaking(true);
    historyRef.current.push({ role: "user", content: text });

    try {
      const reply = await callGeminiText(apiKey, historyRef.current, text);
      historyRef.current.push({ role: "model", content: reply });
      setStatus("Whispering...");

      try {
          const audioUrl = await callGoogleTTS(apiKey, reply, detectedMood);
          if(audioUrl && audioElementRef.current) {
             const audio = audioElementRef.current;
             audio.src = audioUrl;
             audio.oncanplay = async () => { try { await audio.play(); } catch(e) {} };
             audio.onended = () => { setIsSpeaking(false); setStatus("Idle"); };
          }
      } catch (e) {
          console.warn("Fallback TTS");
          speakNativeBrowser(reply, () => { setIsSpeaking(false); setStatus("Idle"); });
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
      
      {/* Organic Background Layer */}
      <BackgroundBlobs mood={mood} />

      <Canvas camera={{ position: [4, 2.25, 3.5], fov: 30 }}>
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
         animate={{ y: 0, opacity: 1 }} 
         transition={{ type: "spring", stiffness: 100, damping: 20 }}
         className="absolute bottom-8 left-0 right-0 flex justify-center z-50 px-4"
      >
        <div className="w-full max-w-lg backdrop-blur-2xl bg-white/5 border border-white/10 rounded-[3rem] p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] transition-all duration-500"
             style={{ boxShadow: `0 0 40px ${MOODS[mood].color}20` }}>
            
            {/* Status Pill */}
            <div className="flex justify-center mb-4">
                <div className="px-4 py-1 rounded-full bg-black/20 text-[10px] font-bold tracking-[0.2em] uppercase flex items-center gap-2 text-white/80">
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
                    
                    {/* Emotion Test Chips */}
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