import type { ProfessionalRuleType, RuleStrategy } from "../types";
import { fixedStrategy } from "./fixed";
import { perCaseStrategy } from "./per-case";
import { perToothStrategy } from "./per-tooth";
import { percentageStrategy } from "./percentage";
import { hybridStrategy } from "./hybrid";
import { customStrategy } from "./custom";

const registry = new Map<ProfessionalRuleType, RuleStrategy>();

export function registerRuleStrategy(strategy: RuleStrategy) {
  registry.set(strategy.type, strategy);
}

export function getRuleStrategy(type: ProfessionalRuleType): RuleStrategy | undefined {
  return registry.get(type);
}

export function listRuleStrategies(): RuleStrategy[] {
  return [...registry.values()];
}

// Register built-ins.
registerRuleStrategy(fixedStrategy);
registerRuleStrategy(perCaseStrategy);
registerRuleStrategy(perToothStrategy);
registerRuleStrategy(percentageStrategy);
registerRuleStrategy(hybridStrategy);
registerRuleStrategy(customStrategy);
