// Desktop-only facade for the current inventory UI.
export * from "./stock-v2";
export {
  adjustStockV2LocalFirst as adjustStockV2,
  createStockCategoryV2LocalFirst as createStockCategoryV2,
  createStockItemV2LocalFirst as createStockItemV2,
  deleteStockCategoryV2LocalFirst as deleteStockCategoryV2,
  deleteStockItemV2LocalFirst as deleteStockItemV2,
  fetchStockCategoriesV2LocalFirst as fetchStockCategoriesV2,
  fetchStockItemsV2LocalFirst as fetchStockItemsV2,
  linkStockItemToImplantSystemLocalFirst as linkStockItemToImplantSystem,
  updateStockCategoryV2LocalFirst as updateStockCategoryV2,
  updateStockItemV2LocalFirst as updateStockItemV2,
} from "./stock-v2-local-first";
