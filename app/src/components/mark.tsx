// Bursar's mark: a small ledger book whose face shows what the agent is doing.
export type MarkMood = "duty" | "thinking" | "paid" | "asking" | "paused";

const tone: Record<MarkMood, string> = {
  duty: "#1F4D3A",
  thinking: "#1F4D3A",
  paid: "#2E7D57",
  asking: "#8A4A26",
  paused: "#5E5A52",
};

export function Mark({ mood = "duty", size = 40, className = "" }: { mood?: MarkMood; size?: number; className?: string }) {
  const c = tone[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label={`Bursar, ${mood}`}>
      {/* book cover and pages */}
      <rect x="7" y="6" width="32" height="38" rx="5" fill={c} />
      <rect x="11" y="9" width="30" height="34" rx="4" fill="#FFFDF8" stroke={c} strokeWidth="2" />
      <line x1="16" y1="9" x2="16" y2="43" stroke={c} strokeWidth="1.5" opacity="0.35" />
      {/* eyes */}
      {mood === "paused" ? (
        <>
          <line x1="21" y1="22" x2="25" y2="22" stroke="#1B1A17" strokeWidth="2" strokeLinecap="round" />
          <line x1="30" y1="22" x2="34" y2="22" stroke="#1B1A17" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : mood === "thinking" ? (
        <>
          <circle cx="24" cy="20" r="1.8" fill="#1B1A17" />
          <circle cx="32" cy="20" r="1.8" fill="#1B1A17" />
        </>
      ) : (
        <>
          <circle cx="23" cy="22" r="1.8" fill="#1B1A17" />
          <circle cx="32" cy="22" r="1.8" fill="#1B1A17" />
        </>
      )}
      {/* mouth */}
      {mood === "paid" && <path d="M22 29 q5.5 5 11 0" fill="none" stroke="#1B1A17" strokeWidth="2" strokeLinecap="round" />}
      {mood === "duty" && <path d="M23 30 q4.5 2.5 9 0" fill="none" stroke="#1B1A17" strokeWidth="2" strokeLinecap="round" />}
      {mood === "thinking" && <line x1="24" y1="30" x2="31" y2="29" stroke="#1B1A17" strokeWidth="2" strokeLinecap="round" />}
      {mood === "asking" && <circle cx="27.5" cy="30" r="2.2" fill="none" stroke="#1B1A17" strokeWidth="2" />}
      {mood === "paused" && <line x1="24" y1="30" x2="31" y2="30" stroke="#1B1A17" strokeWidth="2" strokeLinecap="round" />}
      {/* bookmark ribbon */}
      <path d="M34 9 v9 l2.5 -2 l2.5 2 v-9" fill={mood === "asking" ? "#8A4A26" : "#2E7D57"} />
    </svg>
  );
}
