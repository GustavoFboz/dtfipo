import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_REPORT_CONFIG, filterStockReportItems, stockReplenishmentNeed, stockReportStatus } from "./stock-report";
import type { StockItemV2 } from "./stock-v2";

const item=(overrides:Partial<StockItemV2>):StockItemV2=>({
  id:crypto.randomUUID(),category_id:"cat",category:"component",name:"Item",brand:null,type:null,unit:"un",
  qty_on_hand:10,min_qty:5,notes:null,last_restocked_at:null,created_at:"2026-01-01",updated_at:"2026-01-01",
  requires_sintering:false,custom_fields:[],...overrides,
});

describe("stock report",()=>{
  it("calculates the amount needed to restore the minimum",()=>{
    expect(stockReplenishmentNeed(item({qty_on_hand:2,min_qty:5}))).toBe(3);
    expect(stockReplenishmentNeed(item({qty_on_hand:8,min_qty:5}))).toBe(0);
  });

  it("distinguishes zero, below minimum, limit and adequate stock",()=>{
    expect(stockReportStatus(item({qty_on_hand:0,min_qty:5})).label).toBe("Sem estoque");
    expect(stockReportStatus(item({qty_on_hand:2,min_qty:5})).label).toBe("Abaixo do mínimo");
    expect(stockReportStatus(item({qty_on_hand:5,min_qty:5})).label).toBe("No limite mínimo");
    expect(stockReportStatus(item({qty_on_hand:7,min_qty:5})).label).toBe("Adequado");
  });

  it("filters category and attention status without mixing unrelated materials",()=>{
    const rows=[
      item({id:"1",category_id:"diss",name:"Dissilicato A",qty_on_hand:2,min_qty:5}),
      item({id:"2",category_id:"diss",name:"Dissilicato B",qty_on_hand:7,min_qty:5}),
      item({id:"3",category_id:"zirc",name:"Zirconia",qty_on_hand:0,min_qty:4}),
    ];
    const filtered=filterStockReportItems(rows,{...DEFAULT_STOCK_REPORT_CONFIG,categoryId:"diss",status:"attention"});
    expect(filtered.map(row=>row.id)).toEqual(["1"]);
  });
});
