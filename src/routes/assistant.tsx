import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  ShieldAlert,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Section, Pill } from "@/components/flow/ui";
import { useFlow, useNow } from "@/lib/workflow/store";
import {
  AI_SAFETY_DISCLAIMER,
  processAssistantQuery,
  type AIResponse,
} from "@/lib/ai/assistant";
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
  type SpeechRecognitionController,
} from "@/lib/ai/speech";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/assistant")({
  head: () => meta("AI Voice Assistant", "Voice and text clinical coordinator assistant with Tamil and English voice synthesis."),
  component: AIAssistantPage,
});

interface ConversationMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  tamilText?: string;
  timestamp: number;
  action?: AIResponse["proposedAction"];
}

function AIAssistantPage() {
  const state = useFlow();
  const { user, complete } = useFlow();
  const now = useNow();

  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [readAloud, setReadAloud] = useState(true);
  const [language, setLanguage] = useState<"en-IN" | "ta-IN">("en-IN");
  const [editableNotes, setEditableNotes] = useState<Record<string, string>>({});

  const [history, setHistory] = useState<ConversationMessage[]>([
    {
      id: "init-1",
      sender: "ai",
      text: `Hello ${user.name}! I am your FertiFlow AI Clinical Coordinator. You can ask questions about active department queues, overdue alerts, patient handover briefs, or state quick voice updates.`,
      timestamp: Date.now(),
    },
  ]);

  const recognizerRef = useRef<SpeechRecognitionController | null>(null);
  const hasVoiceRecognition = isSpeechRecognitionSupported();

  useEffect(() => {
    return () => {
      stopSpeaking();
      recognizerRef.current?.stop();
    };
  }, []);

  const handleToggleListening = () => {
    if (!hasVoiceRecognition) {
      toast.warning("Voice recognition requires Google Chrome or Microsoft Edge.");
      return;
    }

    if (isListening) {
      recognizerRef.current?.stop();
      setIsListening(false);
    } else {
      stopSpeaking();
      recognizerRef.current = createSpeechRecognizer({
        lang: language,
        onStart: () => setIsListening(true),
        onResult: (transcript) => {
          setIsListening(false);
          setQuery(transcript);
          handleExecute(transcript);
        },
        onError: (err) => {
          setIsListening(false);
          console.warn("Speech error:", err);
          if (err !== "no-speech") {
            toast.error("Could not capture speech. Please retry or type below.");
          }
        },
        onEnd: () => setIsListening(false),
      });

      recognizerRef.current?.start();
    }
  };

  const handleExecute = (textToRun = query) => {
    const q = textToRun.trim();
    if (!q) return;

    const userMsg: ConversationMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: q,
      timestamp: Date.now(),
    };

    const res = processAssistantQuery(q, state, user, language, now);

    const aiMsgId = `ai-${Date.now()}`;
    const aiMsg: ConversationMessage = {
      id: aiMsgId,
      sender: "ai",
      text: res.text,
      ...(res.tamilText ? { tamilText: res.tamilText } : {}),
      timestamp: Date.now(),
      ...(res.proposedAction ? { action: res.proposedAction } : {}),
    };

    if (res.proposedAction) {
      setEditableNotes((prev) => ({
        ...prev,
        [aiMsgId]: res.proposedAction!.note,
      }));
    }

    setHistory((prev) => [...prev, userMsg, aiMsg]);
    setQuery("");

    if (readAloud && isSpeechSynthesisSupported()) {
      const textToSpeak = language === "ta-IN" && res.tamilText ? res.tamilText : res.spokenText;
      speakText(textToSpeak, language);
    }
  };

  const handleConfirmHandover = (msgId: string, action: NonNullable<AIResponse["proposedAction"]>) => {
    const customNote = editableNotes[msgId] || action.note;
    const res = complete(action.taskId, customNote);

    if (res.ok) {
      toast.success(res.message);
      // Remove action card to prevent double clicks and add confirmation message
      setHistory((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                action: undefined,
                text: `${m.text}\n\n✓ Handover Confirmed: ${action.patientId} has been successfully advanced to ${action.nextDeptName}.`,
              }
            : m,
        ),
      );
      if (readAloud) {
        speakText(`Handover confirmed for ${action.patientId}. Automatically sent to ${action.nextDeptName}.`, language);
      }
    } else {
      toast.error(res.message);
    }
  };

  const SUGGESTIONS = [
    "How many tasks are overdue?",
    "What is critical now?",
    "What is pending for the Lab?",
    "Prepare a handover summary for P-1042",
    "P-1042 embryology done, 9 mature eggs, grade A",
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="AI Voice Assistant"
        desc="Interactive hands-free clinical coordination powered by browser Web Speech API (speech to text & speech synthesis)."
        actions={
          <div className="flex items-center gap-2">
            <Pill tone="pink">Voice & Text Active</Pill>
          </div>
        }
      />

      {/* Safety Notice */}
      <div className="rounded-xl border border-primary/20 bg-accent/40 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Clinical Safety Guardrail: </span>
            {AI_SAFETY_DISCLAIMER}
          </div>
        </div>
      </div>

      {/* Control panel */}
      <div className="grid gap-4 sm:grid-cols-2 card-surface p-4 rounded-xl border">
        <div className="flex items-center gap-3">
          <Label htmlFor="assistant-lang" className="text-xs font-semibold">Language:</Label>
          <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
            <SelectTrigger id="assistant-lang" className="w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-IN">English (India)</SelectItem>
              <SelectItem value="ta-IN">Tamil (தமிழ்)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Label htmlFor="assistant-voice-toggle" className="text-xs cursor-pointer flex items-center gap-1.5 font-semibold">
            {readAloud ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            Read answers aloud
          </Label>
          <Switch id="assistant-voice-toggle" checked={readAloud} onCheckedChange={setReadAloud} />
        </div>
      </div>

      {/* Speech fallback warning if unsupported */}
      {!hasVoiceRecognition && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Voice needs Chrome or Edge. Speech recognition is unavailable in your current browser, but typing is fully supported below.
        </div>
      )}

      {/* Voice Recording Central Hero */}
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-card border shadow-sm text-center">
        <button
          type="button"
          onClick={handleToggleListening}
          className={`relative grid h-24 w-24 place-items-center rounded-full transition-all shadow-lg ${
            isListening
              ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
              : "bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90"
          }`}
          aria-label={isListening ? "Stop listening" : "Start speaking"}
        >
          {isListening ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
          {isListening && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-5 w-5 bg-destructive" />
            </span>
          )}
        </button>

        <h3 className="mt-4 font-display text-lg font-semibold">
          {isListening
            ? language === "ta-IN" ? "கேட்கிறது... தயவுசெய்து பேசுங்கள்" : "Listening... Speak your clinical question now"
            : "Press to Speak"}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Uses Web Speech API. Questions are parsed in real time against current clinic patient and task records.
        </p>

        {/* Input box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleExecute();
          }}
          className="mt-6 flex w-full max-w-lg gap-2"
        >
          <Input
            placeholder="Or type here (e.g. How many tasks are overdue?)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm"
          />
          <Button type="submit">
            <Send className="h-4 w-4 mr-1" />
            Send
          </Button>
        </form>

        {/* Quick prompt suggestions */}
        <div className="mt-4 flex flex-wrap justify-center gap-1.5 max-w-xl">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuery(s);
                handleExecute(s);
              }}
              className="rounded-full border bg-muted/60 px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Thread */}
      <Section title="Assistant Transcript">
        <div className="space-y-4">
          {history.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "card-surface border shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-[11px] opacity-75">
                  {msg.sender === "user" ? (
                    <span>You ({user.name})</span>
                  ) : (
                    <span className="flex items-center gap-1 font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      FertiFlow AI
                    </span>
                  )}
                  <span>· {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>

                <div className="whitespace-pre-wrap font-medium">{msg.text}</div>
                {msg.tamilText && (
                  <div className="mt-1 text-xs italic opacity-85">{msg.tamilText}</div>
                )}

                {/* MANDATORY CONFIRMATION CARD FOR QUICK UPDATE */}
                {msg.action && (
                  <div className="mt-4 rounded-xl border-2 border-primary/40 bg-accent/30 p-4 space-y-3 text-foreground">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="font-semibold text-sm flex items-center gap-2 text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Quick Update Confirmation Card
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {msg.action.patientId}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Patient:</span>{" "}
                        <span className="font-semibold">{msg.action.patientName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Department:</span>{" "}
                        <span className="font-semibold">{msg.action.deptName}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Handover To:</span>{" "}
                        <span className="font-bold text-primary">→ {msg.action.nextDeptName}</span>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor={`note-${msg.id}`} className="text-xs text-foreground font-semibold">
                        Handover Note (Staff Editable):
                      </Label>
                      <Textarea
                        id={`note-${msg.id}`}
                        value={editableNotes[msg.id] ?? msg.action.note}
                        onChange={(e) =>
                          setEditableNotes({
                            ...editableNotes,
                            [msg.id]: e.target.value,
                          })
                        }
                        className="mt-1 text-xs min-h-[60px] bg-card text-foreground"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleConfirmHandover(msg.id, msg.action!)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Confirm & Advance Handover
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
