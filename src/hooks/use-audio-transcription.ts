import { useCallback, useRef, useState } from "react";

function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { merged.set(c, o); o += c.length; }

  // downsample (simple averaging)
  const ratio = sampleRate / targetRate;
  const outLen = Math.floor(merged.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }

  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, out.length * 2, true);
  let p = 44;
  for (let i = 0; i < out.length; i++, p += 2) {
    const s = Math.max(-1, Math.min(1, out[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export type RecorderState = "idle" | "recording" | "transcribing";

export function useAudioTranscription() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    node: ScriptProcessorNode;
    source: MediaStreamAudioSourceNode;
    chunks: Float32Array[];
    timer: ReturnType<typeof setInterval>;
  } | null>(null);

  const start = useCallback(async () => {
    if (ref.current) return true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    ref.current = { stream, ctx, node, source, chunks, timer };
    setState("recording");
    return true;
  }, []);

  const teardown = useCallback(() => {
    const r = ref.current;
    ref.current = null;
    if (!r) return null;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    r.node.disconnect();
    r.source.disconnect();
    const rate = r.ctx.sampleRate;
    void r.ctx.close();
    return { chunks: r.chunks, rate };
  }, []);

  const cancel = useCallback(() => {
    teardown();
    setState("idle");
    setSeconds(0);
  }, [teardown]);

  /** Stops recording and returns the transcribed text (or throws with a message). */
  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    const r = teardown();
    setSeconds(0);
    if (!r) return "";
    setState("transcribing");
    try {
      const blob = encodeWav(r.chunks, r.rate);
      if (blob.size < 2048) throw new Error("Gravação vazia — tente novamente.");
      const fd = new FormData();
      fd.append("file", blob, "recording.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível transcrever o áudio.");
      return (data.text ?? "").trim();
    } finally {
      setState("idle");
    }
  }, [teardown]);

  return { state, seconds, start, cancel, stopAndTranscribe };
}
