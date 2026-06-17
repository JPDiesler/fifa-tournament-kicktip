// Local, bundled provider logos for AI players (no external URLs). The SVGs are
// inlined (?raw) so we can theme the monochrome one: colours from the file win, and
// OpenAI (no fill → inherits CSS `fill: currentColor`) stays visible on dark/light.
import claudeRaw from "@/assets/providers/claude.svg?raw";
import openaiRaw from "@/assets/providers/openai.svg?raw";
import geminiRaw from "@/assets/providers/gemini.svg?raw";
import mistralRaw from "@/assets/providers/mistral.svg?raw";

const RAW = { anthropic: claudeRaw, openai: openaiRaw, gemini: geminiRaw, mistral: mistralRaw };

export default function ProviderLogo({ provider, size = 14, className = "" }) {
  const raw = RAW[provider];
  if (raw) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fill: "currentColor" }}
        className={`inline-flex shrink-0 items-center justify-center text-foreground [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className}`}
        dangerouslySetInnerHTML={{ __html: raw }}
      />
    );
  }
  return (
    <span aria-hidden style={{ background: "#52525b", width: size, height: size, fontSize: Math.round(size * 0.55) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-[4px] font-bold leading-none text-white ${className}`}>KI</span>
  );
}
