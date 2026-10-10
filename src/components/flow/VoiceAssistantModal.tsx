import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface VoiceAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoiceAssistantModal({ open, onOpenChange }: VoiceAssistantModalProps) {
  const state = useFlow();
  const { user, complete } = useFlow();
  const now = useNow();

  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [readAloud, setReadAloud] = useState(true);
  const [language, setLanguage] = useState<"en-IN" | "ta-IN">("en-IN");
  const [editableNote, setEditableNote] = useState("");

  const recognizerRef = useRef<SpeechRecognitionController | null>(null);
  const hasVoiceRecognition = isSpeechRecognitionSupported();

  useEffect(() => {
    if (!open) {
      stopSpeaking();
      recognizerRef.current?.stop();
      setIsListening(false);
    }
  }, [open]);

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
          handleExecuteQuery(transcript);
        },
        onError: (err) => {
          setIsListening(false);
          console.warn("Speech recognition error:", err);
          if (err !== "no-speech") {
            toast.error("Speech recognition error. Please try again or type below.");
          }
        },
        onEnd: () => setIsListening(false),
      });

      recognizerRef.current?.start();
    }
  };

  const handleExecuteQuery = (textToRun = query) => {
    const q = textToRun.trim();
    if (!q) return;

    const res = processAssistantQuery(q, state, user, language, now);
    setResponse(res);

    if (res.proposedAction) {
      setEditableNote(res.proposedAction.note);
    }

    if (readAloud && isSpeechSynthesisSupported()) {
      const textToSpeak = language === "ta-IN" && res.tamilText ? res.tamilText : res.spokenText;
      speakText(textToSpeak, language);
    }
  };

  const handleConfirmAction = () => {
    if (!response?.proposedAction) return;

    const action = response.proposedAction;
    const res = complete(action.taskId, editableNote);

    if (res.ok) {
      toast.success(res.message);
      setResponse({
        text: `Handover complete for ${action.patientId}. Automatically sent to ${action.nextDeptName || "next stage"}.`,
        spokenText: `Handover complete for ${action.patientId}.`,
      });
      if (readAloud) {
        speakText(`Handover confirmed for ${action.patientId}.`, language);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-display">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              FertiFlow Voice Assistant
            </DialogTitle>
          </div>
          <DialogDescription>
            Ask clinical coordination questions or state quick handover updates. Real clinic data only.
          </DialogDescription>
        </DialogHeader>

        {!hasVoiceRecognition && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Voice needs Chrome or Edge. You can still type queries below.
          </div>
        )}

        {/* Controls row */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="lang-select" className="text-xs text-muted-foreground">Language:</Label>
            <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
              <SelectTrigger id="lang-select" className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-IN">English (India)</SelectItem>
                <SelectItem value="ta-IN">Tamil (தமிழ்)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="read-aloud" checked={readAloud} onCheckedChange={setReadAloud} />
            <Label htmlFor="read-aloud" className="text-xs cursor-pointer flex items-center gap-1">
              {readAloud ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
              Read answers aloud
            </Label>
          </div>
        </div>

        {/* Microphone action area */}
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-muted/40 border border-dashed border-border/80 text-center">
          <button
            type="button"
            onClick={handleToggleListening}
            className={`relative grid h-20 w-20 place-items-center rounded-full transition-all shadow-md ${
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse scale-105"
                : "bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90"
            }`}
            aria-label={isListening ? "Stop listening" : "Start speaking"}
          >
            {isListening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
            {isListening && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive" />
              </span>
            )}
          </button>

          <p className="mt-3 text-xs font-medium text-foreground">
            {isListening
              ? language === "ta-IN" ? "கேட்கிறது... பேசுங்கள்" : "Listening... Speak your question now"
              : "Click the microphone to speak, or type below"}
          </p>
        </div>

        {/* Text query input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleExecuteQuery();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Type your question or update (e.g. How many tasks are overdue?)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit">
            <Send className="h-4 w-4 mr-1" />
            Ask
          </Button>
        </form>

        {/* Suggestions chips */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Suggestions:</span>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setQuery(s);
                  handleExecuteQuery(s);
                }}
                className="rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Response display */}
        {response && (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Assistant Answer
              </span>
              {readAloud && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => speakText(response.spokenText, language)}
                >
                  <Volume2 className="h-3.5 w-3.5 mr-1" />
                  Replay
                </Button>
              )}
            </div>

            <p className="text-sm font-medium leading-relaxed">{response.text}</p>
            {response.tamilText && (
              <p className="text-xs text-muted-foreground italic">{response.tamilText}</p>
            )}

            {/* MANDATORY CONFIRMATION CARD FOR QUICK UPDATES */}
            {response.proposedAction && (
              <div className="mt-4 rounded-xl border-2 border-primary/40 bg-accent/30 p-4 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Review Handover Action
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {response.proposedAction.patientId}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Patient:</span>{" "}
                    <span className="font-medium">{response.proposedAction.patientName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current Stage:</span>{" "}
                    <span className="font-medium">{response.proposedAction.deptName}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Target Destination:</span>{" "}
                    <span className="font-semibold text-primary">→ {response.proposedAction.nextDeptName}</span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-note" className="text-xs">Clinical / Handover Note (Editable):</Label>
                  <Textarea
                    id="edit-note"
                    value={editableNote}
                    onChange={(e) => setEditableNote(e.target.value)}
                    className="mt-1 text-xs min-h-[60px]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResponse(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmAction}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Confirm & Advance Handover
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Safety Disclaimer */}
        <div className="rounded-lg border border-border/80 bg-background/50 p-2.5 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Safety: </span>
          {AI_SAFETY_DISCLAIMER}
        </div>
      </DialogContent>
    </Dialog>
  );
}
