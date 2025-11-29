"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, Html, useTexture, Sparkles as DreiSparkles, MeshDistortMaterial, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { motion } from "framer-motion";
import { Volume2, VolumeX, XCircle, Mic, Play, Loader2, Sparkles } from "lucide-react";

/**
 * CONFIG
 */
const VRM_URL = "/model/6441211855445306245.vrm";

/**
 * 🧚‍♀️ FAIRY PROMPT ENGINEERING
 */
const SYSTEM_PROMPT = `
You are a gentle Dream Fairy named Lumina. 
You live in the space between sleep and waking.
Your voice is soft, soothing, and filled with wonder.
Speak using metaphors of stars, clouds, moonlight, and glowing rivers.
Keep your answers short (max 2 sentences), poetic, and comforting.
Never act robotic. You are a magical being.
`;

/**
 * --- NEW COMPONENT: DREAM BACKGROUND ---
 * Creates a fluid, organic, colorful atmosphere.
 */
function DreamBackground() {
  const backgroundRef = useRef();
  
  // Slow rotation for the background fluid sphere
  useFrame(({ clock }) => {
    if (backgroundRef.current) {
      backgroundRef.current.rotation.y = clock.getElapsedTime() * 0.02;
      backgroundRef.current.rotation.z = clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <group>
      {/* 1. Distant Fluid Skydome */}
      {/* A huge sphere surrounding everything, inverted so we see the inside */}
      <Sphere ref={backgroundRef} args={[20, 64, 64]} scale={[-1, 1, 1]} position={[0, 0, 0]}>
        {/* MeshDistortMaterial creates the organic, fluid movement */}
        <MeshDistortMaterial
          color="#4a0072" // Deep purple base
          attach="material"
          distort={0.6} // Strength of the distortion
          speed={1.5} // Speed of the fluid movement
          roughness={0.4}
          metalness={0.8}
          side={THREE.BackSide} // Render inside of sphere
        />
      </Sphere>

      {/* 2. Secondary colored "clouds" */}
      <Sphere args={[15, 32, 32]} position={[10, 5, -15]}>
         <MeshDistortMaterial color="#ff0080" distort={0.8} speed={2} transparent opacity={0.3} roughness={0} />
      </Sphere>
      <Sphere args={[12, 32, 32]} position={[-10, -5, -10]}>
         <MeshDistortMaterial color="#00ffff" distort={0.8} speed={2} transparent opacity={0.2} roughness={0} />
      </Sphere>

      {/* 3. Ambient Sparkles */}
      <DreiSparkles 
        count={200} 
        scale={[20, 20, 20]} 
        size={2} 
        speed={0.4} 
        opacity={0.7}
        color="#ffe0ff" 
      />
    </group>
  );
}


/**
 * API HELPERS (Unchanged)
 */
const callGeminiText = async (apiKey, history, message) => {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) throw new Error("No API key");
  
  const prompt = {
    contents: [
      ...(history || []).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.content }] })),
      { role: "user", parts: [{ text: message }] }
    ],
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    generationConfig: {
      maxOutputTokens: 100,
      temperature: 1.2,
    }
  };
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(cleanKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prompt)
  });
  
  if (!res.ok) {
     const err = await res.json();
     throw new Error(err.error?.message || "Gemini API Error");
  }

  const data = await res.json();
  if (data?.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text;
  throw new Error("No text response");
};

const callGoogleTTS = async (apiKey, text) => {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) throw new Error("No Key");
  
  const payload = {
    input: { text: text },
    voice: { languageCode: "en-US", name: "en-US-Journey-F" }, 
    audioConfig: { audioEncoding: "MP3", speakingRate: 0.95, pitch: 2.0 } 
  };
  
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(cleanKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  
  if (!res.ok) throw new Error("Google TTS Failed");
  
  const data = await res.json();
  const base64 = data.audioContent;
  if (!base64) throw new Error("No audio content");
  
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  
  const blob = new Blob([bytes.buffer], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
};

// Fallback: Browser Native TTS
const speakNativeBrowser = (text, onEnd) => {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1.4; 
  const voices = window.speechSynthesis.getVoices();
  const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Google US English'));
  if (femaleVoice) utterance.voice = femaleVoice;
  utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
};

/**
 * VRM MODEL COMPONENT (Unchanged)
 */
function VRMModel({ url, onLoaded, setVrmRef, isSpeaking }) {
  const { scene } = useThree();
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });

  useEffect(() => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;

    VRMUtils.combineSkeletons(vrm.scene);
    vrm.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        if (obj.material) {
          obj.material.transparent = true;
          obj.material.alphaTest = 0.5;
          obj.material.depthWrite = true;
        }
      }
    });

    const lArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rArm = vrm.humanoid.getRawBoneNode("rightUpperArm");
    if (lArm) lArm.rotation.z = Math.PI / 3;
    if (rArm) rArm.rotation.z = -Math.PI / 3;

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

  useFrame(({ clock }) => {
    const vrm = gltf.userData.vrm;
    if (!vrm) return;
    
    vrm.update(clock.getDelta());
    const t = clock.getElapsedTime();
    
    const spine = vrm.humanoid.getRawBoneNode("spine");
    if (spine) {
      spine.rotation.x = Math.sin(t * 1.5) * 0.03;
      spine.rotation.y = Math.sin(t * 0.5) * 0.02;
    }

    const lArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rArm = vrm.humanoid.getRawBoneNode("rightUpperArm");
    const lHand = vrm.humanoid.getRawBoneNode("leftHand");
    const rHand = vrm.humanoid.getRawBoneNode("rightHand");

    if (isSpeaking) {
      if (lArm) lArm.rotation.z = (Math.PI / 2.5) + Math.sin(t * 3) * 0.1;
      if (rArm) rArm.rotation.z = -(Math.PI / 2.5) - Math.sin(t * 3) * 0.1;
      if (lHand) lHand.rotation.x = Math.sin(t * 4) * 0.2;
      if (rHand) rHand.rotation.x = Math.sin(t * 4) * 0.2;
    } else {
      if (lArm) lArm.rotation.z = THREE.MathUtils.lerp(lArm.rotation.z, Math.PI / 3 + Math.sin(t)*0.05, 0.05);
      if (rArm) rArm.rotation.z = THREE.MathUtils.lerp(rArm.rotation.z, -Math.PI / 3 - Math.sin(t)*0.05, 0.05);
    }
  });

  return null;
}

/**
 * ANIMATION CONTROLLER (Unchanged)
 */
function AnimeGuide({ vrm, analyser }) {
  const { mouse } = useThree();
  useFrame(() => {
    if (!vrm) return;

    const head = vrm.humanoid?.getRawBoneNode("head");
    if (head) {
      head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, mouse.x * 0.5, 0.08);
      head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, mouse.y * 0.3, 0.08);
    }

    if (Math.random() < 0.005 && vrm.expressionManager) {
      vrm.expressionManager.setValue('blink', 1);
      setTimeout(() => vrm.expressionManager.setValue('blink', 0), 150);
    }

    if (analyser && vrm.expressionManager) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const vol = Math.sqrt(sum / data.length);
      
      const mouthOpen = THREE.MathUtils.clamp(vol * 25.0, 0, 1.0);
      
      vrm.expressionManager.setValue('aa', mouthOpen);
      vrm.expressionManager.setValue('ih', mouthOpen * 0.5);
      vrm.expressionManager.setValue('oh', mouthOpen * 0.3);
      vrm.expressionManager.setValue('happy', 0.3); 
    }
  });
  return null;
}

/**
 * MAIN APP
 */
export default function DreamVRMApp() {
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [vrmRef, setVrmRef] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Click to Awaken");
  const [audioReady, setAudioReady] = useState(false);

  const audioContextRef = useRef(null);
  const audioElementRef = useRef(null);
  const analyserRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("dreamApiKey");
    if (stored) {
        try { setApiKey(JSON.parse(stored)); } catch {}
    }
  }, []);

  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;
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
    if (!apiKey) return;
    if (!audioContextRef.current) initAudio();
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

    setStatus("Dreaming...");
    setIsSpeaking(true);
    historyRef.current.push({ role: "user", content: text });

    try {
      const reply = await callGeminiText(apiKey, historyRef.current, text);
      historyRef.current.push({ role: "model", content: reply });
      setStatus("Weaving Spell...");

      try {
          const audioUrl = await callGoogleTTS(apiKey, reply);
          if (audioUrl && audioElementRef.current) {
            const audio = audioElementRef.current;
            audio.src = audioUrl;
            audio.oncanplay = async () => {
                 try {
                    await audio.play();
                    setStatus("Whispering...");
                 } catch (err) {
                    console.error("Play error", err);
                 }
            };
            audio.onended = () => { setIsSpeaking(false); setStatus("Idle"); };
          }
      } catch (ttsError) {
          console.warn("Falling back to native", ttsError);
          speakNativeBrowser(reply, () => {
              setIsSpeaking(false);
              setStatus("Idle");
          });
      }
    } catch (e) {
      console.error(e);
      setStatus("Error: " + e.message);
      setIsSpeaking(false);
    }
  }, [apiKey, initAudio]);

  const startListening = () => {
    if (!audioContextRef.current) initAudio();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      handleSpeak("Hello Fairy.");
      return;
    }
    const rec = new Recognition();
    rec.onstart = () => setStatus("Listening...");
    rec.onresult = (e) => handleSpeak(e.results[0][0].transcript);
    rec.start();
  };

  if (!mounted) return <div className="bg-black h-screen w-full flex items-center justify-center text-white bg-gradient-to-b from-indigo-950 to-purple-950">Summoning Dream...</div>;

  return (
    // Changed outer div background to a gradient for better blending
    <div className="relative w-full h-screen bg-gradient-to-b from-[#1a0b2e] to-[#0f0514] text-white overflow-hidden" onClick={() => !audioReady && initAudio()}>
      <Canvas camera={{ position: [0, 1.25, 3.5], fov: 30 }}>
        {/* Added Fog for depth and dreaming effect */}
        <fog attach="fog" args={['#1a0b2e', 5, 25]} />
        
        <ambientLight intensity={0.4} />
        {/* Colorful dreamy lighting */}
        <directionalLight intensity={1.2} position={[5, 5, 5]} color="#ffabed" /> 
        <pointLight position={[-3, 2, 2]} intensity={2} color="#6e3aff" distance={10} />
        <spotLight position={[0, 5, 0]} intensity={1} color="#00ffff" angle={0.5} penumbra={1} />

        {/* --- THE DREAM BACKGROUND --- */}
        <DreamBackground />

        <Suspense fallback={<Html center><div className="text-white animate-pulse">Manifesting Form...</div></Html>}>
          <VRMModel url={VRM_URL} setVrmRef={setVrmRef} isSpeaking={isSpeaking} />
          {vrmRef && <AnimeGuide vrm={vrmRef} analyser={analyserRef.current} />}
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={Math.PI/2} minPolarAngle={Math.PI/2.5} />
      </Canvas>

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 w-96 backdrop-blur-xl bg-white/10 border border-purple-400/30 rounded-3xl p-6 shadow-2xl shadow-purple-900/40">
        <div className="text-center mb-4 text-purple-200 text-xs font-bold tracking-widest uppercase flex items-center justify-center gap-2">
            {isSpeaking && <Sparkles className="animate-spin w-3 h-3 text-yellow-200"/>}
            {status}
        </div>
        
        {!apiKey ? (
           <div className="flex flex-col gap-2">
               <input 
                 type="password" 
                 placeholder="Paste Google Cloud API Key" 
                 className="w-full bg-transparent border-b border-purple-300/50 text-white pb-2 text-center focus:outline-none placeholder:text-white/50" 
                 onChange={e => {
                     setApiKey(e.target.value); 
                     localStorage.setItem("dreamApiKey", JSON.stringify(e.target.value));
                 }} 
               />
               <div className="text-[10px] text-purple-200/50 text-center">API Key Required</div>
           </div>
        ) : !audioReady ? (
           <button onClick={initAudio} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition rounded-full font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30">
             <Play size={16}/> Awaken Lumina
           </button>
        ) : (
           <div className="flex gap-3">
             <button onClick={startListening} className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full h-12 flex items-center justify-center hover:scale-105 transition shadow-lg shadow-purple-500/30">
                <Mic className="text-white" />
             </button>
             <button onClick={() => handleSpeak("Tell me a secret about the stars.")} className="px-6 rounded-full border border-purple-300/30 hover:bg-white/10 text-sm transition">
                Ask
             </button>
           </div>
        )}
      </motion.div>
    </div>
  );
}