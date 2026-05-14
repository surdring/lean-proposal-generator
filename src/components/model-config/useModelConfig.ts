import { useState, useRef, useEffect } from 'react';
import {
  fetchModels as apiFetchModels,
  fetchModelsFromProvider,
  saveConfig as apiSaveConfig,
  testModel as apiTestModel,
} from '../../services/geminiService';
import type {
  ProviderConfig,
  ProviderPreset,
  ModelsInfo,
  UseModelConfigReturn,
  EffectiveConfig,
  TestModelResult,
} from './types';

// localStorage helpers
const LS_PROVIDERS_KEY = 'ai_providers';
const LS_ACTIVE_KEY = 'ai_active_provider';

function loadProviders(): Record<string, ProviderConfig> {
  try {
    const raw = localStorage.getItem(LS_PROVIDERS_KEY);
    if (raw) {
      const data: Record<string, ProviderConfig> = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        if (data[key].models) data[key].models = [...new Set(data[key].models)];
      }
      return data;
    }
  } catch {}
  return {};
}

function persistProviders(providers: Record<string, ProviderConfig>) {
  localStorage.setItem(LS_PROVIDERS_KEY, JSON.stringify(providers));
}

export function useModelConfig(): UseModelConfigReturn {
  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<TestModelResult | null>(null);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);

  // Refs
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Data state
  const [modelsInfo, setModelsInfo] = useState<ModelsInfo | null>(null);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [activeProviderId, setActiveProviderId] = useState(
    () => localStorage.getItem(LS_ACTIVE_KEY) || 'server'
  );
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(() => loadProviders());

  // Derived: current provider config
  const currentConfig: ProviderConfig = providers[activeProviderId] || {
    apiKey: '',
    baseUrl: '',
    models: [],
    freeModels: [],
    selectedModel: '',
  };
  const safeFreeModels = currentConfig.freeModels || [];

  // Derived: filtered model list
  const displayModels =
    showFreeOnly && safeFreeModels.length > 0 ? safeFreeModels : currentConfig.models;
  const isSearching = modelInput !== '' && modelInput !== currentConfig.selectedModel;
  const filteredModels = isSearching
    ? displayModels.filter((m) => m.toLowerCase().includes(modelInput.toLowerCase()))
    : displayModels;

  // Derived: effective config for API calls
  const effectiveConfig: EffectiveConfig = {
    baseUrl:
      activeProviderId === 'server'
        ? modelsInfo?.baseUrl || ''
        : currentConfig.baseUrl ||
          providerPresets.find((p) => p.id === activeProviderId)?.baseUrl ||
          '',
    apiKey: activeProviderId === 'server' ? '' : currentConfig.apiKey,
    model: currentConfig.selectedModel || modelsInfo?.default || '',
  };

  // Persist to localStorage on change
  useEffect(() => {
    persistProviders(providers);
    localStorage.setItem(LS_ACTIVE_KEY, activeProviderId);
  }, [providers, activeProviderId]);

  // Sync modelInput with selectedModel
  useEffect(() => {
    setModelInput(currentConfig.selectedModel || '');
  }, [currentConfig.selectedModel]);

  // Init: load server defaults and provider presets
  useEffect(() => {
    apiFetchModels().then((info) => {
      setModelsInfo(info);
      setProviderPresets(info.providerPresets || []);
      if (activeProviderId === 'server') {
        setProviders((prev) => ({
          ...prev,
          server: {
            ...prev.server,
            models: info.models,
            selectedModel: prev.server?.selectedModel || info.default,
          },
        }));
      }
    }).catch(() => {});
  }, []);

  // Close provider dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        providerDropdownRef.current &&
        !providerDropdownRef.current.contains(e.target as Node)
      ) {
        setProviderDropdownOpen(false);
      }
    };
    if (providerDropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [providerDropdownOpen]);

  // Actions
  const handleSwitchProvider = (id: string) => {
    setActiveProviderId(id);
    const preset = providerPresets.find((p) => p.id === id);
    if (!providers[id]) {
      setProviders((prev) => ({
        ...prev,
        [id]: {
          apiKey: preset?.defaultApiKey || '',
          baseUrl: preset?.baseUrl || '',
          models: [],
          freeModels: [],
          selectedModel: '',
        },
      }));
    }
    if (id === 'custom') {
      setAdvancedSettingsOpen(true);
    }
    setProviderDropdownOpen(false);
  };

  const updateProvider = (patch: Partial<ProviderConfig>) => {
    setProviders((prev) => ({
      ...prev,
      [activeProviderId]: { ...prev[activeProviderId], ...patch },
    }));
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchModelsError(null);
    try {
      const cfg = providers[activeProviderId] || currentConfig;
      const baseUrl =
        cfg.baseUrl || providerPresets.find((p) => p.id === activeProviderId)?.baseUrl;
      const result = await fetchModelsFromProvider(
        cfg.apiKey || undefined,
        baseUrl || undefined
      );
      const models = [...new Set(result.models)];
      const freeModels = [...new Set(result.freeModels)];
      updateProvider({ models, freeModels });
      if (models.length > 0 && !providers[activeProviderId]?.selectedModel) {
        updateProvider({ selectedModel: models[0] });
      }
    } catch (err: any) {
      const msg = err?.message || '获取模型列表失败';
      setFetchModelsError(msg);
      console.error('Failed to fetch models:', err);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const cfg =
        activeProviderId === 'server'
          ? { model: currentConfig.selectedModel || modelsInfo?.default }
          : {
              apiKey: currentConfig.apiKey,
              baseUrl:
                currentConfig.baseUrl ||
                providerPresets.find((p) => p.id === activeProviderId)?.baseUrl,
              model: currentConfig.selectedModel,
              models: currentConfig.models.join(','),
            };
      const saved = await apiSaveConfig(cfg);
      setModelsInfo((prev) =>
        prev
          ? {
              ...prev,
              default: saved.model,
              models: saved.models,
              baseUrl: saved.baseUrl,
              hasApiKey: !!saved.apiKey,
            }
          : prev
      );
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  // Test current model
  const handleTestModel = async () => {
    setTestingModel(true);
    setTestResult(null);
    try {
      const result = await apiTestModel(
        effectiveConfig.model || undefined,
        effectiveConfig.apiKey || undefined,
        effectiveConfig.baseUrl || undefined
      );
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Unknown error' });
    } finally {
      setTestingModel(false);
    }
  };

  return {
    // State
    settingsOpen,
    setSettingsOpen,
    showApiKey,
    fetchingModels,
    fetchModelsError,
    savingConfig,
    configSaved,
    modelsInfo,
    providerPresets,
    showFreeOnly,
    modelInput,
    modelDropdownOpen,
    advancedSettingsOpen,
    providerDropdownOpen,
    activeProviderId,
    currentConfig,
    safeFreeModels,
    filteredModels,
    effectiveConfig,

    // Refs
    providerDropdownRef,
    modelDropdownRef,

    // Actions
    handleSwitchProvider,
    updateProvider,
    handleFetchModels,
    handleSaveConfig,
    setShowApiKey,
    setShowFreeOnly,
    setModelInput,
    setModelDropdownOpen,
    setAdvancedSettingsOpen,
    setProviderDropdownOpen,

    // Test model
    testingModel,
    testResult,
    handleTestModel,
  };
}
