// Desktop-only stock facade.
//
// Existing screens keep importing `@/lib/stock`. The Tauri build aliases that
// module here so stock reads and ordinary manual movements keep working from
// SQLite while the Web build continues using the cloud implementation.
export * from "./stock";
export {
  adjustItemLocalFirst as adjustItem,
  consumeItemLocalFirst as consumeItem,
  createStockItemLocalFirst as createStockItem,
  deleteStockItemLocalFirst as deleteStockItem,
  fetchStockItemsLocalFirst as fetchStockItems,
  fetchStockMovementsLocalFirst as fetchStockMovements,
  restockItemLocalFirst as restockItem,
  updateStockItemLocalFirst as updateStockItem,
} from "./stock-local-first";
