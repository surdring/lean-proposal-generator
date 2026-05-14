import type React from 'react';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  models: string[];
  freeModels: string[];
  selectedModel: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  needsApiKey: boolean;
  defaultApiKey?: string;
}

export interface ModelsInfo {
  default: string;
  models: string[];
  baseUrl: string;
  hasApiKey: boolean;
  providerPresets: ProviderPreset[];
}

export interface SavedConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  models: string[];
}

export interface EffectiveConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TestModelResult {
  success: boolean;
  latency?: number;
  reply?: string;
  model?: string;
  error?: string;
}

export interface UseModelConfigReturn {
  // State
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  showApiKey: boolean;
  fetchingModels: boolean;
  fetchModelsError: string | null;
  savingConfig: boolean;
  configSaved: boolean;
  modelsInfo: ModelsInfo | null;
  providerPresets: ProviderPreset[];
  showFreeOnly: boolean;
  modelInput: string;
  modelDropdownOpen: boolean;
  advancedSettingsOpen: boolean;
  providerDropdownOpen: boolean;
  activeProviderId: string;
  currentConfig: ProviderConfig;
  safeFreeModels: string[];
  filteredModels: string[];

  // Effective config for API calls
  effectiveConfig: EffectiveConfig;

  // Refs
  providerDropdownRef: React.RefObject<HTMLDivElement | null>;
  modelDropdownRef: React.RefObject<HTMLDivElement | null>;

  // Actions
  handleSwitchProvider: (id: string) => void;
  updateProvider: (patch: Partial<ProviderConfig>) => void;
  handleFetchModels: () => Promise<void>;
  handleSaveConfig: () => Promise<void>;
  setShowApiKey: (v: boolean) => void;
  setShowFreeOnly: (v: boolean) => void;
  setModelInput: (v: string) => void;
  setModelDropdownOpen: (v: boolean) => void;
  setAdvancedSettingsOpen: (v: boolean) => void;
  setProviderDropdownOpen: (v: boolean) => void;

  // Test model
  testingModel: boolean;
  testResult: TestModelResult | null;
  handleTestModel: () => Promise<void>;
}

export type ModelConfigVariant = 'default' | 'compact' | 'modal-content';

export interface ModelConfigProps {
  /** Hook return value from useModelConfig */
  config: UseModelConfigReturn;
  /** Optional: override the section title (default: "AI 配置") */
  title?: string;
  /** Display variant */
  variant?: ModelConfigVariant;
  /** Optional: callback when "完成" button is clicked in modal-content variant */
  onDone?: () => void;
}

export interface ModelConfigRootProps {
  /** Hook return value from useModelConfig */
  config: UseModelConfigReturn;
  children: React.ReactNode;
}

export interface SubComponentProps {
  config: UseModelConfigReturn;
}
