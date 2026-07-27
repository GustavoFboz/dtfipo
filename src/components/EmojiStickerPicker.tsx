import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import { STICKER_LIST, Sticker } from "./stickers";

// Conjunto curado de emojis modernos e minimalistas
const EMOJIS: { label: string; items: string[] }[] = [
  { label: "Reações", items: ["👍","👎","👏","🙌","🙏","💪","🤝","👌","✌️","🤞","🫶","❤️","🧡","💛","💚","💙","💜","🤍","🖤","💯","✨","🔥","⭐","🌟","💫"] },
  { label: "Sentimentos", items: ["😀","😄","😅","😊","😍","🥰","😘","😎","🤩","🤔","😌","😴","🤤","🥲","😭","😢","😡","🤯","😱","🥳","😇","🤗","🫡","🫠","😉"] },
  { label: "Trabalho", items: ["✅","☑️","📌","📎","🗂️","📁","📂","📝","✏️","🖊️","🧾","📊","📈","📉","💼","🗓️","⏰","⌛","🔔","🔕","🔍","🔎","💡","🛠️","⚙️"] },
  { label: "Saúde", items: ["🦷","🩺","💉","💊","🧪","🧬","🧠","🫀","🫁","🩹","🩻","👨‍⚕️","👩‍⚕️","🧑‍⚕️","🏥","🧼","🧴","🪥","🧽","🩼","🧯","🆘","♻️","🟢","🔴"] },
];

export function EmojiStickerPicker({
  onPickEmoji, onPickSticker, trigger,
}: {
  onPickEmoji: (e: string) => void;
  onPickSticker: (id: string) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Inserir emoji ou figurinha">
            <Smile className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex border-b">
          <button type="button"
            onClick={() => setTab("emoji")}
            className={`flex-1 px-3 py-2 text-xs font-medium ${tab === "emoji" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}>
            Emojis
          </button>
          <button type="button"
            onClick={() => setTab("sticker")}
            className={`flex-1 px-3 py-2 text-xs font-medium ${tab === "sticker" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}>
            Figurinhas
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {tab === "emoji" ? (
            <div className="space-y-3">
              {EMOJIS.map((g) => (
                <div key={g.label}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">{g.label}</div>
                  <div className="grid grid-cols-8 gap-1">
                    {g.items.map((e) => (
                      <button key={e} type="button"
                        onClick={() => { onPickEmoji(e); setOpen(false); }}
                        className="h-8 w-8 grid place-items-center text-lg rounded hover:bg-accent">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {STICKER_LIST.map((s) => (
                <button key={s.id} type="button"
                  onClick={() => { onPickSticker(s.id); setOpen(false); }}
                  title={s.label}
                  className="aspect-square rounded-lg border bg-card hover:border-primary hover:bg-primary/5 grid place-items-center p-2">
                  <Sticker id={s.id} size={44} />
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
