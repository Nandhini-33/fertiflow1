/**
 * Browser Web Speech API wrappers for Speech-to-Text and Text-to-Speech
 * Supports en-IN and ta-IN.
 */

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

export interface SpeechRecognitionController {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function createSpeechRecognizer(options: {
  lang: "en-IN" | "ta-IN";
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  onStart?: () => void;
}): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) return null;

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  const recognition = new SpeechRecognitionClass();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = options.lang;

  recognition.onstart = () => {
    options.onStart?.();
  };

  recognition.onresult = (event: any) => {
    const transcript = event.results[0]?.[0]?.transcript || "";
    options.onResult(transcript);
  };

  recognition.onerror = (event: any) => {
    options.onError(event.error || "Speech recognition error");
  };

  recognition.onend = () => {
    options.onEnd();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (err) {
        console.warn("Speech recognition already active:", err);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (err) {
        // ignore
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch (err) {
        // ignore
      }
    },
  };
}

export function speakText(text: string, lang: "en-IN" | "ta-IN" = "en-IN"): void {
  if (!isSpeechSynthesisSupported()) return;

  try {
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try finding matching voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang === lang || v.lang.startsWith(lang.slice(0, 2)));
    if (voice) {
      utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}
