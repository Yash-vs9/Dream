# 🧚‍♀️ Lumina: The AI Dream Fairy

> An immersive, 3D interactive dreamscape powered by **Google Gemini**, **React Three Fiber**, and **Native Speech Synthesis**.

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![React](https://img.shields.io/badge/React-18-cyan) ![Three.js](https://img.shields.io/badge/Three.js-Fiber-black)

## ✨ Overview

**Lumina** is not just a chatbot; she is a "Dream Fairy" living in your browser. This project combines high-fidelity 3D rendering with Generative AI to create a soothing, surreal companion.

Unlike standard AI wrappers, Lumina features **real-time lip-syncing**, **emotional atmospheric shifts**, **long-term memory**, and **cursor-tracking head movements**, all running efficiently in the browser.

## 🚀 Key Features

* **🧠 Gemini AI Brain:** Powered by Google's `Gemini-2.0-flash` for fast, creative, and roleplay-aware conversations.
* **🗣️ Native Anime Voice:** Uses the browser's native `SpeechSynthesis` API tuned to sound like a cute, energetic anime character (Zero cost, no API limits).
* **👄 Real-Time Lip Sync:** The 3D avatar's mouth moves perfectly in sync with the audio volume.
* **👀 Interactive Head Tracking:** Lumina's head follows your mouse cursor, creating a sense of presence and eye contact.
* **🌦️ Emotional Atmosphere:** The environment reacts to the conversation:
    * *Happy/Excited:* Floating flowers & warm colors.
    * *Sad:* Rain & greyscale tones.
    * *Confused:* Camera blur & fog.
* **💾 Long-Term Memory:** Remembers your name and previous conversations using `localStorage`. (Includes a "Forget" button).
* **🎵 Dynamic Audio:** Soothing background ambience + toggleable sound effects.

## 🛠️ Tech Stack

* **Framework:** [Next.js](https://nextjs.org/) (React 18)
* **3D Engine:** [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) & [Drei](https://github.com/pmndrs/drei)
* **Model Loader:** [Pixiv Three-VRM](https://github.com/pixiv/three-vrm)
* **AI Model:** [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai)
* **Animations:** Framer Motion (UI) & Procedural Bone Animation (3D)
* **Styling:** Tailwind CSS

## 📦 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/dream-fairy-lumina.git](https://github.com/your-username/dream-fairy-lumina.git)
    cd dream-fairy-lumina
    ```

2.  **Install Dependencies:**
    ```bash
    npm install three @react-three/fiber @react-three/drei @react-three/postprocessing @pixiv/three-vrm framer-motion lucide-react
    ```

3.  **Add Your 3D Model:**
    * Place your VRM file inside the `public/model/` folder.
    * *Note: The code expects the file at `/model/6441211855445306245.vrm`. You can change the `VRM_URL` constant in the code to match your file name.*

4.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    Open `http://localhost:3000` in your browser.

## 🔑 How to Use

1.  **Get a Gemini API Key:**
    * Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
    * Create a free API key.
2.  **Enter the Key:** Paste the key into the input box on the screen.
3.  **Awaken:** Click **"Awaken Dream"**.
4.  **Interact:**
    * Click the **Microphone** to speak.
    * Move your **Mouse** to see her watch you.
    * Click the **Music Note** to toggle BGM.
    * Click the **Trash Can** to wipe her memory.

## 🎨 Customization

* **Change Voice:** Locate the `speakNativeBrowser` function to adjust `pitch` (1.5 = Anime, 1.0 = Normal) and `rate`.
* **Change Persona:** Edit the `SYSTEM_PROMPT` constant to change her name, personality, or backstory.
* **Change Moods:** Edit the `MOODS` object to define new colors and particle effects for different emotions.

## 🤝 Credits

* **3D Model:** [VRoid Hub](https://hub.vroid.com/) (Ensure you have usage rights for the model you use).
* **Background Music:** [Pixabay](https://pixabay.com/music/).
* **Icons:** [Lucide React](https://lucide.dev/).

## 📄 License

This project is open source and available under the [MIT License](LICENSE).