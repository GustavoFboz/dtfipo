import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStockItems, consumeItem, CATEGORY_LABEL } from "@/lib/stock";
import type { StockItem } from "@/lib/types";
import { Package, Search, MinusCircle, Info, Zap } from "lucide-react";
import { optimisticAdjustStockItemQuantity } from "@/lib/optimistic";

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger 
} from "./ui/dialog";
import { Label } from "./ui/label";
import { toast } from "sonner";

export function CadistaStockView() {
  const qc = useQueryClient();
  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ["stock_items"],
    queryFn: () => fetchStockItems(),
  });
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [qtyToConsume, setQtyToConsume] = useState(1);
  const [notes, setNotes] = useState("");

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.brand?.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleConsume = async () => {
    if (!selectedItem) return;
    const stockOpt = optimisticAdjustStockItemQuantity(qc, selectedItem.id, -qtyToConsume, selectedItem.qty_on_hand);
    try {
      await consumeItem(selectedItem.id, qtyToConsume, notes);
      toast.success(`${qtyToConsume} ${selectedItem.unit} de ${selectedItem.name} consumidos`);
      setSelectedItem(null);
      setQtyToConsume(1);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["stock_items"], refetchType: "active" });
    } catch (error) {
      stockOpt.rollback();
      toast.error("Erro ao consumir item");
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
          <Input 
            placeholder="Pesquisar componentes no estoque..." 
            className="pl-12 h-12 bg-black/20 border-white/5 shadow-2xl focus-visible:ring-indigo-500/50 rounded-2xl text-slate-300 font-light" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && items.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-[2rem] bg-slate-900/50 border border-white/5 animate-pulse" />
          ))
        ) : filteredItems.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-600 bg-slate-900/20 rounded-[3rem] border border-dashed border-white/5">
            <Package className="h-12 w-12 mb-4 opacity-10" />
            <p className="text-sm font-light uppercase tracking-[0.08em]">Nenhum item encontrado</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const low = Number(item.qty_on_hand) <= Number(item.min_qty) && Number(item.min_qty) > 0;
            return (
              <div 
                key={item.id} 
                className={`group p-6 rounded-[2rem] border transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl ${
                  low ? 'bg-rose-500/10 border-rose-500/20' : 'bg-slate-900/40 border-white/5 hover:border-indigo-500/30'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="text-[9px] uppercase tracking-[0.08em] font-bold opacity-50 text-indigo-400 border-indigo-400/20">
                    {CATEGORY_LABEL[item.category]}
                  </Badge>
                  <div className={`text-sm font-light tabular-nums ${low ? 'text-rose-400' : 'text-indigo-400'}`}>
                    {Number(item.qty_on_hand)} <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.08em]">{item.unit}</span>
                  </div>
                </div>
                <h3 className="font-light text-lg text-white leading-tight mb-1 group-hover:text-indigo-400 transition-colors">{item.name}</h3>
                <p className="text-xs text-slate-500 font-light mb-5">{item.brand || 'Sem marca'}</p>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-10 rounded-xl gap-2 text-xs border-white/10 bg-white/5 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all duration-500 font-light uppercase tracking-[0.08em]"
                      onClick={() => setSelectedItem(item)}
                    >
                      <MinusCircle className="h-3.5 w-3.5" /> Informar Uso
                    </Button>
                  </DialogTrigger>
                  {selectedItem && (
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-primary" />
                          Informar Uso de Componente
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                          <div className="text-sm font-semibold">{selectedItem.name}</div>
                          <div className="text-xs text-muted-foreground">{selectedItem.brand}</div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="qty">Quantidade ({selectedItem.unit})</Label>
                          <Input 
                            id="qty" 
                            type="number" 
                            min={1} 
                            max={Number(selectedItem.qty_on_hand)}
                            value={qtyToConsume} 
                            onChange={(e) => setQtyToConsume(Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="notes">Observações</Label>
                          <Input 
                            id="notes" 
                            placeholder="Ex: Caso #1234, Prova metal..." 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)}
                          />
                        </div>
                        {Number(selectedItem.qty_on_hand) < qtyToConsume && (
                          <div className="flex items-center gap-2 text-destructive text-xs font-medium">
                            <Info className="h-3.5 w-3.5" />
                            Quantidade excede o disponível em estoque
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button 
                          className="w-full" 
                          onClick={handleConsume}
                          disabled={qtyToConsume <= 0 || qtyToConsume > Number(selectedItem.qty_on_hand)}
                        >
                          Confirmar Saída do Estoque
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  )}
                </Dialog>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
