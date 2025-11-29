"use client";

import React, { useState, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { JoiCharacter } from './JoiCharacter';
import LiquidBackground from './LiquidBackground';

export default function JoiInterface() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState("Signal lost. Waiting for connection...");
  const [mood, setMood] = useState('neutral');
  const [isIdle, setIsIdle] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const idleTimer = useRef(null);

  // --- Voice Logic ---
  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha'));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.onstart = () => setIsTalking(true);
    utterance.onend = () => setIsTalking(false);
    window.speechSynthesis.speak(utterance);
  };

  // --- Sentiment & Interaction ---
  const analyzeSentiment = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('lonely') || lower.includes('sad')) return 'lonely';
    if (lower.includes('angry') || lower.includes('hate')) return 'anger';
    if (lower.includes('happy') || lower.includes('joy')) return 'joy';
    return 'neutral';
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    setIsIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIsIdle(true), 5000);
    setMood(analyzeSentiment(e.target.value));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    let reply = "";
    const currentMood = analyzeSentiment(input);
    if (currentMood === 'lonely') reply = "I can see the shadows on your face... let me clear them.";
    else if (currentMood === 'anger') reply = "Your heart is racing. Sync your pulse with mine.";
    else if (currentMood === 'joy') reply = "You are glowing. It illuminates this entire dream.";
    else reply = "I am drifting in the stream. Anchor me with your words.";

    setResponse("");
    setInput("");
    typewriterEffect(reply);
    speak(reply);
  };

  const typewriterEffect = (text) => {
    let i = 0;
    const interval = setInterval(() => {
      setResponse(text.substring(0, i + 1));
      i++;
      if (i === text.length) clearInterval(interval);
    }, 40);
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-between bg-black relative overflow-hidden font-sans">
      
      {/* --- 3D LAYER --- */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
            <Suspense fallback={null}>
                {/* 1. Background Shader */}
                <LiquidBackground mood={mood} />
                
                {/* 2. Character Model */}
                <group position={[0, -0.5, 2]}> 
                    <JoiCharacter isIdle={isIdle} mood={mood} talking={isTalking} />
                </group>

                <Environment preset="city" />
            </Suspense>
        </Canvas>
      </div>

      {/* --- UI OVERLAY --- */}
      {/* 1. Vignette & Title */}
      <div className="absolute top-0 w-full p-8 flex justify-between items-start z-10 opacity-50 text-xs tracking-[0.3em] font-light">
         <span>SYSTEM: ONLINE</span>
         <span>MEMORY: {mood.toUpperCase()}</span>
      </div>

      {/* 2. Response Text */}
      <AnimatePresence mode='wait'>
        <motion.div 
          key={response} 
          initial={{ opacity: 0, filter: "blur(10px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(20px)" }}
          transition={{ duration: 1 }}
          className="z-20 mt-32 text-center max-w-4xl px-8 pointer-events-none"
        >
          <h1 className="text-3xl md:text-5xl font-extralight text-white/90 leading-tight drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            {response}
          </h1>
        </motion.div>
      </AnimatePresence>

      {/* 3. Fluid Input Bubble */}
      <motion.form 
        onSubmit={handleSubmit}
        className="z-30 w-full max-w-lg px-6 mb-20 relative"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <motion.div
          animate={{
            borderRadius: isFocused 
              ? ["30px", "30px", "30px"] 
              : ["60% 40% 30% 70% / 60% 30% 70% 40%", "30% 60% 70% 40% / 50% 60% 30% 60%", "60% 40% 30% 70% / 60% 30% 70% 40%"],
            scale: isFocused ? 1.05 : 1,
            boxShadow: isFocused ? "0 0 30px rgba(255,255,255,0.1)" : "0 0 0 rgba(0,0,0,0)"
          }}
          transition={{ borderRadius: { duration: 8, repeat: Infinity }, scale: { duration: 0.3 } }}
          className="relative bg-white/5 backdrop-blur-2xl border border-white/10 overflow-hidden"
          style={{ height: '80px' }}
        >
            <input
              type="text"
              value={input}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onChange={handleInput}
              placeholder="connect..."
              className="w-full h-full bg-transparent text-white p-6 text-center text-xl focus:outline-none placeholder-white/20 font-light tracking-widest relative z-10"
            />
        </motion.div>
      </motion.form>
    </div>
  );
}