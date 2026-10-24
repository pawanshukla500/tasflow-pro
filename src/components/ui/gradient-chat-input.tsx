import * as React from "react";
import { Plus, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  types                                                             */
/* ------------------------------------------------------------------ */
export interface ChatMessage {
  id: number;
  text: string;
  sender: "user" | "bot";
}

export interface GradientChatInputProps {
  /** Placeholder shown inside the text field. */
  placeholder?: string;
  /** Auto-reply pushed back after a user message. Pass `null` to disable. */
  autoReply?: string | null;
  /** Delay (ms) before the auto-reply lands. */
  autoReplyDelay?: number;
  /** Max number of bubbles kept on screen. */
  maxVisible?: number;
  /** Play synthesized send / receive sounds. */
  sound?: boolean;
  /** The spectrum used for the reveal glow (top → bottom). */
  gradientColors?: string[];
  /** Fired whenever the user submits a message. */
  onSend?: (message: string) => void;
  className?: string;
  /** Controlled text. When set, the field does not keep its own message stack. */
  value?: string;
  onValueChange?: (value: string, cursor: number) => void;
  onAttach?: () => void;
  disabled?: boolean;
  sending?: boolean;
  canSend?: boolean;
  multiline?: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  onInputKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInputSelect?: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  inputId?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
}

/* ------------------------------------------------------------------ */
/*  defaults                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_GRADIENT = [
  "#FC2BA3",
  "#FC6D35",
  "#F9C83D",
  "#C2D6E1",
  "#144EC5",
];

/* ------------------------------------------------------------------ */
/*  component                                                         */
/* ------------------------------------------------------------------ */
export default function GradientChatInput({
  placeholder = "Send Message",
  autoReply = "Got it — looking into that now ✨",
  autoReplyDelay = 650,
  maxVisible = 4,
  sound = true,
  gradientColors = DEFAULT_GRADIENT,
  onSend,
  className,
  value: valueProp,
  onValueChange,
  onAttach,
  disabled = false,
  sending = false,
  canSend,
  multiline = false,
  inputRef,
  onInputKeyDown,
  onInputSelect,
  inputId,
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
  "aria-activedescendant": ariaActiveDescendant,
}: GradientChatInputProps) {
  const controlled = valueProp !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState("");
  const value = controlled ? valueProp : uncontrolled;
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const idRef = React.useRef(0);
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = React.useRef<AudioContext | null>(null);

  const setValue = (next: string, cursor: number) => {
    if (!controlled) setUncontrolled(next);
    onValueChange?.(next, cursor);
  };

  /* lazy AudioContext — only created on the first user gesture */
  const getAudioContext = React.useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    return audioRef.current;
  }, []);

  /* two-note blip synthesized inline — no audio assets to ship */
  const playChime = React.useCallback(
    (notes: { freq: number; at: number }[], volume: number) => {
      if (!sound) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume();

      notes.forEach(({ freq, at }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + at;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    },
    [sound, getAudioContext],
  );

  const playSend = React.useCallback(
    () =>
      playChime(
        [
          { freq: 523.25, at: 0 },
          { freq: 783.99, at: 0.06 },
        ],
        0.05,
      ),
    [playChime],
  );

  const playReceive = React.useCallback(
    () =>
      playChime(
        [
          { freq: 392.0, at: 0 },
          { freq: 587.33, at: 0.08 },
        ],
        0.05,
      ),
    [playChime],
  );

  /* cleanup pending timers + audio context on unmount */
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      void audioRef.current?.close();
    };
  }, []);

  const pushMessage = (text: string, sender: ChatMessage["sender"]) =>
    setMessages((prev) => [...prev, { id: idRef.current++, text, sender }]);

  const handleSend = () => {
    const text = value.trim();
    if (!text && !canSend) return;
    if (disabled || sending) return;

    onSend?.(text);
    if (!controlled) {
      if (text) pushMessage(text, "user");
      playSend();
      setValue("", 0);

      if (autoReply && text) {
        const timer = setTimeout(() => {
          pushMessage(autoReply, "bot");
          playReceive();
          timersRef.current = timersRef.current.filter((item) => item !== timer);
        }, autoReplyDelay);
        timersRef.current.push(timer);
      }
    }
  };

  const hasText = value.trim().length > 0;
  const ready = canSend ?? hasText;
  const visible = messages.slice(-maxVisible);
  const glow = `linear-gradient(135deg, ${gradientColors.join(", ")})`;

  return (
    <div className={cn("relative mx-auto w-full", className)}>
      <div
        className="relative rounded-3xl p-px shadow-[0_10px_20px_-6px_rgba(0,0,0,0.1)]"
        style={{ backgroundImage: glow }}
      >
        <div className="relative z-[2] flex items-end gap-2 rounded-[1.4rem] bg-background p-1.5">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={onAttach ? "Attach files" : "Add attachment"}
            className="size-10 shrink-0 rounded-xl [&_svg]:size-5"
            onClick={onAttach}
            disabled={disabled || !onAttach}
          >
            <Plus className="size-5" />
          </Button>
          <textarea
            ref={inputRef}
            id={inputId}
            value={value}
            rows={multiline ? 2 : 1}
            disabled={disabled}
            placeholder={placeholder}
            aria-label="Message"
            aria-expanded={ariaExpanded}
            aria-controls={ariaControls}
            aria-activedescendant={ariaActiveDescendant}
            onChange={(event) => setValue(event.target.value, event.target.selectionStart ?? event.target.value.length)}
            onSelect={onInputSelect}
            onKeyDown={(event) => {
              onInputKeyDown?.(event);
              if (event.defaultPrevented) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 disabled:opacity-50 md:text-sm"
          />
          <Button
            type="button"
            onClick={handleSend}
            onMouseDown={(event) => event.preventDefault()}
            variant={ready ? "default" : "secondary"}
            size="icon"
            aria-label={sending ? "Sending message" : "Send message"}
            disabled={disabled || sending || !ready}
            className="size-10 shrink-0 rounded-xl transition-colors active:scale-95 [&_svg]:size-5"
          >
            <Send className="size-5" strokeWidth={2.25} />
          </Button>
        </div>

        {!controlled && (
          <div className="pointer-events-none absolute bottom-[70px] right-0 z-[1] flex w-full flex-col items-end gap-2">
            <AnimatePresence initial={false}>
              {visible.map((message) => (
                <motion.div
                  key={message.id}
                  layout
                  initial={{ opacity: 0, y: 24, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className={cn(
                    "max-w-[260px] break-words px-3.5 py-2.5 text-sm shadow-[0_10px_20px_-6px_rgba(0,0,0,0.15)]",
                    message.sender === "user"
                      ? "self-end rounded-[14px_14px_6px_14px] border border-border bg-background text-foreground"
                      : "self-start rounded-[14px_14px_14px_6px] bg-primary text-primary-foreground",
                  )}
                >
                  {message.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
