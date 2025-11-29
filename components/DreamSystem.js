"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, Html, MeshDistortMaterial, Sphere, Stars, Sparkles as DreiSparkles } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, XCircle, Mic, Play, Loader2, Sparkles } from "lucide-react";

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
  neutral: { bg: "#0f172a", light: "#38bdf8", fog: "#1e293b", distortion: 0.4, speed: 1 },
  calm: { bg: "#0c4a6e", light: "#7dd3fc", fog: "#075985", distortion: 0.2, speed: 0.5 },
  fear: { bg: "#450a0a", light: "#f87171", fog: "#2a0404", distortion: 1.2, speed: 3 },
  frustrated: { bg: "#431407", light: "#fb923c", fog: "#290d04", distortion: 0.8, speed: 2 },
  excitement: { bg: "#4a044e", light: "#e879f9", fog: "#39033b", distortion: 0.6, speed: 1.5 }
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
  
  // Adjust pitch/speed based on mood
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

// Analyze basic sentiment locally to switch background faster
const analyzeSentiment = (text) => {
    const t = text.toLowerCase();
    if (t.match(/(scared|dark|nightmare|run|shadow|fear)/)) return 'fear';
    if (t.match(/(angry|stuck|annoyed|why|hate|broken)/)) return 'frustrated';
    if (t.match(/(wow|yay|love|amazing|fly|magic|star)/)) return 'excitement';
    if (t.match(/(calm|sleep|peace|quiet|rest|hello)/)) return 'calm';
    return 'neutral';
};

/**
 * --- 3D BACKGROUND COMPONENT ---
 */
function DreamAtmosphere({ mood }) {
  const currentMood = MOODS[mood] || MOODS.neutral;
  const mesh = useRef();
  
  useFrame((state, delta) => {
    if (mesh.current) {
        mesh.current.rotation.x += delta * 0.1;
        mesh.current.rotation.y += delta * 0.15;
    }
    // Smooth background color transition
    state.scene.background = new THREE.Color(currentMood.bg);
    state.scene.fog = new THREE.FogExp2(currentMood.fog, 0.02);
  });

  return (
    <group>
      {/* Dynamic light color */}
      <directionalLight position={[5, 5, 5]} intensity={1.5} color={currentMood.light} />
      <pointLight position={[-5, -5, -5]} intensity={1} color={currentMood.light} />
      
      {/* Fluid Orb Background */}
      <Sphere ref={mesh} args={[10, 64, 64]} position={[0, 0, -10]} scale={2}>
         <MeshDistortMaterial 
            color={currentMood.light} 
            attach="material" 
            distort={currentMood.distortion} 
            speed={currentMood.speed} 
            roughness={0.2} 
            transparent 
            opacity={0.3} 
         />
      </Sphere>

      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <DreiSparkles count={100} scale={12} size={2} speed={0.4} opacity={0.5} color={currentMood.light} />
    </group>
  );
}

/**
 * --- VRM AVATAR CONTROLLER ---
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

    // Initial Neutral Pose (Hands Down)
    const lArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rArm = vrm.humanoid.getRawBoneNode("rightUpperArm");
    if (lArm) lArm.rotation.z = Math.PI / 2.3; // Approx 80 degrees down
    if (rArm) rArm.rotation.z = -Math.PI / 2.3;

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

  // Procedural Animation Loop
  useFrame(({ clock }) => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;
    vrm.update(clock.getDelta());
    const t = clock.getElapsedTime();

    // 1. Base Idle (Breathing)
    const spine = vrm.humanoid.getRawBoneNode("spine");
    if(spine) {
        spine.rotation.x = Math.sin(t) * 0.05;
        spine.rotation.y = Math.sin(t * 0.5) * 0.05;
    }

    // 2. Dynamic Movements based on State
    const hips = vrm.humanoid.getRawBoneNode("hips");
    const lArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rArm = vrm.humanoid.getRawBoneNode("rightUpperArm");
    const lHand = vrm.humanoid.getRawBoneNode("leftHand");
    const rHand = vrm.humanoid.getRawBoneNode("rightHand");

    if (isSpeaking) {
        // WALKING / FLOATING MOVEMENT
        if(hips) {
            hips.position.y = Math.sin(t * 8) * 0.02; // Bobbing up and down
            hips.rotation.y = Math.sin(t * 2) * 0.05; // Twisting hips
        }

        // EXPRESSIVE HAND GESTURES
        // Lift arms slightly
        if(lArm) lArm.rotation.z = THREE.MathUtils.lerp(lArm.rotation.z, (Math.PI / 3) + Math.sin(t * 3) * 0.1, 0.1);
        if(rArm) rArm.rotation.z = THREE.MathUtils.lerp(rArm.rotation.z, -(Math.PI / 3) - Math.cos(t * 3) * 0.1, 0.1);
        
        // Hand articulation
        if(lHand) lHand.rotation.x = Math.sin(t * 5) * 0.3;
        if(rHand) rHand.rotation.x = Math.cos(t * 5) * 0.3;

    } else {
        // RETURN TO IDLE (Hands Down)
        if(hips) hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0, 0.1);
        
        // Smoothly lower arms
        if(lArm) lArm.rotation.z = THREE.MathUtils.lerp(lArm.rotation.z, Math.PI / 2.3, 0.05);
        if(rArm) rArm.rotation.z = THREE.MathUtils.lerp(rArm.rotation.z, -Math.PI / 2.3, 0.05);
        
        if(lHand) lHand.rotation.x = THREE.MathUtils.lerp(lHand.rotation.x, 0, 0.1);
        if(rHand) rHand.rotation.x = THREE.MathUtils.lerp(rHand.rotation.x, 0, 0.1);
    }
  });

  return null;
}

/**
 * --- FACE & LIP SYNC CONTROLLER ---
 */
function FaceController({ vrm, analyser, mood }) {
    const { mouse } = useThree();
    
    useFrame(() => {
        if(!vrm) return;

        // Head Look
        const head = vrm.humanoid?.getRawBoneNode("head");
        if(head) {
            head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, mouse.x * 0.5, 0.08);
            head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, mouse.y * 0.2, 0.08);
        }

        // Blinking
        if(Math.random() < 0.005) {
            vrm.expressionManager.setValue('blink', 1);
            setTimeout(() => vrm.expressionManager.setValue('blink', 0), 150);
        }

        // Emotion Expression
        const mgr = vrm.expressionManager;
        mgr.setValue('happy', 0);
        mgr.setValue('angry', 0);
        mgr.setValue('sad', 0);
        mgr.setValue('surprised', 0);

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

    // 1. Detect Mood Immediately
    const detectedMood = analyzeSentiment(text);
    setMood(detectedMood);
    
    setStatus("Thinking...");
    setIsSpeaking(true);
    historyRef.current.push({ role: "user", content: text });

    try {
      // 2. Get Text
      const reply = await callGeminiText(apiKey, historyRef.current, text);
      historyRef.current.push({ role: "model", content: reply });
      setStatus("Whispering...");

      // 3. Get Audio
      try {
          const audioUrl = await callGoogleTTS(apiKey, reply, detectedMood);
          if(audioUrl && audioElementRef.current) {
             const audio = audioElementRef.current;
             audio.src = audioUrl;
             audio.oncanplay = async () => {
                 try { await audio.play(); } catch(e) { console.error(e); }
             };
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

  if(!mounted) return <div className="h-screen w-full bg-black flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-sans transition-colors duration-1000"
         style={{ backgroundColor: MOODS[mood].bg }}
         onClick={() => !audioReady && initAudio()}
    >
      <Canvas camera={{ position: [0, 1.25, 3.5], fov: 30 }}>
         <DreamAtmosphere mood={mood} />
         <Suspense fallback={<Html center><div className="animate-pulse">Summoning...</div></Html>}>
            <Avatar url={VRM_URL} setVrmRef={setVrmRef} isSpeaking={isSpeaking} mood={mood} />
            {vrmRef && <FaceController vrm={vrmRef} analyser={analyserRef.current} mood={mood} />}
         </Suspense>
         <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={Math.PI/2} minPolarAngle={Math.PI/2.5} />
      </Canvas>

      {/* --- ORGANIC UI --- */}
      <motion.div 
         initial={{ y: 50, opacity: 0 }} 
         animate={{ y: 0, opacity: 1 }} 
         className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-6"
      >
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-[2rem] p-6 shadow-2xl transition-colors duration-500"
             style={{ borderColor: MOODS[mood].light + "40" }}>
            
            <div className="text-center mb-4 text-xs font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-2" 
                 style={{ color: MOODS[mood].light }}>
                {isSpeaking && <Sparkles className="animate-spin w-3 h-3"/>}
                {status}
            </div>

            {!apiKey ? (
                <div className="space-y-2">
                    <input type="password" placeholder="Google Cloud API Key" 
                        className="w-full bg-transparent border-b border-white/20 pb-2 text-center focus:outline-none placeholder:text-white/30"
                        onChange={e => { setApiKey(e.target.value); localStorage.setItem("dreamApiKey", JSON.stringify(e.target.value)); }} />
                    <div className="text-[10px] text-center opacity-50">Cloud TTS + Generative Language API</div>
                </div>
            ) : !audioReady ? (
                <button onClick={initAudio} className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-full font-bold flex items-center justify-center gap-2 transition">
                    <Play size={16}/> Enter Dream
                </button>
            ) : (
                <div className="flex gap-4">
                    <button onClick={startListening} className="flex-1 h-14 bg-gradient-to-r from-indigo-500/50 to-purple-500/50 rounded-full flex items-center justify-center hover:scale-105 transition shadow-lg">
                        <Mic size={20} />
                    </button>
                    <button onClick={() => handleSpeak("I feel a storm coming...")} className="px-6 rounded-full border border-white/20 hover:bg-white/10 text-xs">
                        Fear Test
                    </button>
                    <button onClick={() => handleSpeak("I am so happy to see the stars!")} className="px-6 rounded-full border border-white/20 hover:bg-white/10 text-xs">
                        Joy Test
                    </button>
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
}