import React, { useState, useRef, useEffect } from 'react';
import { generateProposalStream, generateRequirementsStream, fetchModels, fetchModelsFromProvider, saveConfig, ProposalData, RequirementsData, ModelsInfo, ProviderPreset } from './services/geminiService';
import { Loader2, Printer, Sparkles, FileText, Eraser, Download, FileJson, FileDown, ChevronDown, Cpu, Settings, Eye, EyeOff, RefreshCw, Save, Check } from 'lucide-react';
import { motion } from 'motion/react';

type DocType = 'proposal' | 'requirements';

// Per-provider saved config
interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  models: string[];
  freeModels: string[];
  selectedModel: string;
}

function loadProviders(): Record<string, ProviderConfig> {
  try {
    const raw = localStorage.getItem('ai_providers');
    if (raw) {
      const data: Record<string, ProviderConfig> = JSON.parse(raw);
      // Deduplicate models arrays from cached data
      for (const key of Object.keys(data)) {
        if (data[key].models) data[key].models = [...new Set(data[key].models)];
      }
      return data;
    }
  } catch {}
  return {};
}

function saveProviders(providers: Record<string, ProviderConfig>) {
  localStorage.setItem('ai_providers', JSON.stringify(providers));
}

// Strip markdown syntax for Word-like plain text display
function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^-\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
}

function App() {
  const [idea, setIdea] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState<DocType>('proposal');
  
  const [proposal, setProposal] = useState<Partial<ProposalData> | null>(null);
  const [requirements, setRequirements] = useState<Partial<RequirementsData> | null>(null);
  
  const [error, setError] = useState<string | null>(null);

  // AI Settings (persisted in localStorage per provider)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [modelsInfo, setModelsInfo] = useState<ModelsInfo | null>(null);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Active provider and per-provider configs
  const [activeProviderId, setActiveProviderId] = useState(() => localStorage.getItem('ai_active_provider') || 'server');
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(() => loadProviders());

  // Current provider's config (convenience)
  const currentConfig = providers[activeProviderId] || { apiKey: '', baseUrl: '', models: [] as string[], freeModels: [] as string[], selectedModel: '' };
  // Ensure freeModels always exists (old localStorage data may lack this field)
  const safeFreeModels = currentConfig.freeModels || [];

  // Filtered model list for combobox dropdown
  const displayModels = showFreeOnly && safeFreeModels.length > 0 ? safeFreeModels : currentConfig.models;
  const isSearching = modelInput !== '' && modelInput !== currentConfig.selectedModel;
  const filteredModels = isSearching
    ? displayModels.filter(m => m.toLowerCase().includes(modelInput.toLowerCase()))
    : displayModels;

  // Effective settings for API calls
  const effectiveBaseUrl = activeProviderId === 'server'
    ? (modelsInfo?.baseUrl || '')
    : (currentConfig.baseUrl || providerPresets.find(p => p.id === activeProviderId)?.baseUrl || '');
  const effectiveApiKey = activeProviderId === 'server' ? '' : currentConfig.apiKey;
  const effectiveModel = currentConfig.selectedModel || modelsInfo?.default || '';

  // Save providers to localStorage when changed
  useEffect(() => {
    saveProviders(providers);
    localStorage.setItem('ai_active_provider', activeProviderId);
  }, [providers, activeProviderId]);

  // Sync modelInput with selectedModel
  useEffect(() => {
    setModelInput(currentConfig.selectedModel || '');
  }, [currentConfig.selectedModel]);

  // Init: load server defaults and provider presets
  useEffect(() => {
    fetchModels().then(info => {
      setModelsInfo(info);
      setProviderPresets(info.providerPresets || []);
      // If active provider is server, set models from server config
      if (activeProviderId === 'server') {
        setProviders(prev => ({
          ...prev,
          server: { ...prev.server, models: info.models, selectedModel: prev.server?.selectedModel || info.default }
        }));
      }
    }).catch(() => {});
  }, []);

  const handleSwitchProvider = (id: string) => {
    setActiveProviderId(id);
    const preset = providerPresets.find(p => p.id === id);
    // Initialize provider config if not exists
    if (!providers[id]) {
      setProviders(prev => ({
        ...prev,
        [id]: {
          apiKey: preset?.defaultApiKey || '',
          baseUrl: preset?.baseUrl || '',
          models: [],
          freeModels: [],
          selectedModel: '',
        }
      }));
    }
  };

  const updateProvider = (patch: Partial<ProviderConfig>) => {
    setProviders(prev => ({
      ...prev,
      [activeProviderId]: { ...prev[activeProviderId], ...patch }
    }));
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchModelsError(null);
    try {
      const cfg = providers[activeProviderId] || currentConfig;
      const baseUrl = cfg.baseUrl || providerPresets.find(p => p.id === activeProviderId)?.baseUrl;
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
      const cfg = activeProviderId === 'server'
        ? { model: currentConfig.selectedModel || modelsInfo?.default }
        : {
            apiKey: currentConfig.apiKey,
            baseUrl: currentConfig.baseUrl || providerPresets.find(p => p.id === activeProviderId)?.baseUrl,
            model: currentConfig.selectedModel,
            models: currentConfig.models.join(','),
          };
      const saved = await saveConfig(cfg);
      // Update server modelsInfo from saved result
      setModelsInfo(prev => prev ? { ...prev, default: saved.model, models: saved.models, baseUrl: saved.baseUrl, hasApiKey: !!saved.apiKey } : prev);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  // Form fields for the manual parts of the proposal
  const [proposer, setProposer] = useState('');
  const [unit, setUnit] = useState('');
  const [assistant, setAssistant] = useState('');
  const [deadline, setDeadline] = useState('');

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    
    setLoading(true);
    setError(null);
    
    if (docType === 'proposal') {
      setProposal({});
      setRequirements(null);
      console.log('[AI] 当前使用模型:', effectiveModel || '(默认)', '| 提供商:', activeProviderId, '| BaseURL:', effectiveBaseUrl);
      try {
        await generateProposalStream(
          idea, 
          role || '员工',
          (data) => {
            setProposal(prev => ({ ...prev, ...data }));
          },
          effectiveModel || undefined,
          effectiveApiKey || undefined,
          effectiveBaseUrl || undefined
        );
      } catch (err) {
        setError('生成提案时出错，请重试。');
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setRequirements({});
      setProposal(null);
      try {
        await generateRequirementsStream(
          idea,
          role || '员工',
          null,
          (data) => {
            setRequirements(prev => ({ ...prev, ...data }));
          },
          effectiveModel || undefined,
          effectiveApiKey || undefined,
          effectiveBaseUrl || undefined
        );
      } catch (err) {
        setError('生成需求文档时出错，请重试。');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGenerateReqsFromProposal = async () => {
    if (!proposal) return;
    
    setDocType('requirements');
    setLoading(true);
    setError(null);
    setRequirements({});
    
    // We keep the proposal state so the user can switch back if they want, 
    // but we focus on requirements now.
    
    try {
      await generateRequirementsStream(
        idea,
        role || '员工',
        proposal,
        (data) => {
          setRequirements(prev => ({ ...prev, ...data }));
        },
        effectiveModel || undefined,
        effectiveApiKey || undefined,
        effectiveBaseUrl || undefined
      );
    } catch (err) {
      setError('生成需求文档时出错，请重试。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportMD = () => {
    let md = '';
    if (docType === 'proposal' && proposal) {
      md = `# 月度精益改善自主性提案\n\n> 附件二\n\n`;
      md += `| 项目 | 内容 | 项目 | 内容 |\n`;
      md += `| --- | --- | --- | --- |\n`;
      md += `| 提案名称 | ${proposal.proposalName || ''} | 提案范围 | ${proposal.proposalScope || ''} |\n`;
      md += `| 提案人 | ${proposer} | 单位及岗位 | ${unit} |\n`;
      md += `| 协助人/部门 | ${assistant} | 完成时限 | ${deadline} |\n\n`;
      md += `| 项目 | 内容 |\n`;
      md += `| --- | --- |\n`;
      md += `| 现状或问题 | ${proposal.currentStatus || ''} |\n`;
      md += `| 预期目标或效果 | ${proposal.expectedGoals || ''} |\n`;
      md += `| 计划或措施 | ${proposal.measures || ''} |\n`;
      md += `| 资金预算 | ${proposal.budget || ''} |\n\n`;
      md += `| 项目 | 内容 | 项目 | 内容 |\n`;
      md += `| --- | --- | --- | --- |\n`;
      md += `| 专业部室/科室意见 | | 主管领导意见 | |\n\n`;
      md += `| 项目 | 内容 |\n`;
      md += `| --- | --- |\n`;
      md += `| 备注 | |\n`;
    } else if (requirements) {
      md = `# ${requirements.projectName || '项目需求规格说明书'}\n\n`;
      md += `**项目需求规格说明书 (PRD)**\n\n`;
      md += `---\n\n`;
      md += `## 1. 项目背景与痛点\n\n${requirements.background || ''}\n\n`;
      md += `## 2. 目标用户\n\n${requirements.targetUsers || ''}\n\n`;
      md += `## 3. 功能需求\n\n${requirements.functionalRequirements || ''}\n\n`;
      md += `## 4. 非功能需求\n\n${requirements.nonFunctionalRequirements || ''}\n\n`;
      md += `## 5. 实施路线图\n\n${requirements.roadmap || ''}\n\n`;
      md += `## 6. 成功衡量指标\n\n${requirements.successMetrics || ''}\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = docType === 'proposal'
      ? (proposal?.proposalName || '精益改善提案')
      : (requirements?.projectName || '项目需求规格说明书');
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  const handleClear = () => {
    setIdea('');
    setProposal(null);
    setRequirements(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white">
      {/* Header - Hidden on Print */}
      <header className="bg-slate-900 text-white py-6 px-4 md:px-8 shadow-md print:hidden">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">精益提案生成器</h1>
              <p className="text-slate-400 text-xs mt-0.5">基于《月度精益改善自主性提案》标准模板</p>
            </div>
          </div>
          <div className="flex gap-3">
             {/* Additional actions could go here */}
          </div>
        </div>
      </header>

      <main className="mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-8">
        
        {/* Input Section - Hidden on Print */}
        <section className="w-full md:w-80 flex-shrink-0 space-y-6 print:hidden">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              输入想法
            </h2>
            
            {/* Doc Type Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-lg mb-6">
              <button
                onClick={() => setDocType('proposal')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${docType === 'proposal' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <FileText className="w-4 h-4" />
                精益提案
              </button>
              <button
                onClick={() => setDocType('requirements')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${docType === 'requirements' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <FileJson className="w-4 h-4" />
                需求文档
              </button>
            </div>
            
            {/* AI Settings */}
            <div className="mb-4">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-full flex items-center justify-between gap-2 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors py-1"
              >
                <span className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span className="truncate">AI 配置</span>
                  {activeProviderId !== 'server' && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-200 truncate max-w-[80px]">
                      {providerPresets.find(p => p.id === activeProviderId)?.name || activeProviderId}
                    </span>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {settingsOpen && (
                <div className="mt-3 space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {/* Provider Selector */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      模型提供商
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleSwitchProvider('server')}
                        className={`px-2 py-1 text-[11px] rounded-md border transition-colors truncate max-w-full ${
                          activeProviderId === 'server'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                        }`}
                        title="服务器默认"
                      >
                        服务器默认
                      </button>
                      {providerPresets.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleSwitchProvider(p.id)}
                          className={`px-2 py-1 text-[11px] rounded-md border transition-colors truncate max-w-full ${
                            activeProviderId === p.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                          }`}
                          title={p.name}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeProviderId !== 'server' && (
                    <>
                      {/* Base URL */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          API Base URL
                        </label>
                        <input
                          type="text"
                          value={currentConfig.baseUrl}
                          onChange={(e) => updateProvider({ baseUrl: e.target.value })}
                          placeholder={providerPresets.find(p => p.id === activeProviderId)?.baseUrl || 'https://api.openai.com/v1'}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white truncate"
                        />
                      </div>

                      {/* API Key */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          API Key
                        </label>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={currentConfig.apiKey}
                            onChange={(e) => updateProvider({ apiKey: e.target.value })}
                            placeholder="输入 API Key（Ollama 等本地模型可留空）"
                            className="w-full px-2.5 py-1.5 pr-8 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Model */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                          <Cpu className="w-3 h-3" />
                          模型
                        </label>
                        {currentConfig.models.length > 0 ? (
                          <>
                            <div className="flex gap-1.5 min-w-0">
                              <div className="relative flex-1 min-w-0" ref={modelDropdownRef}>
                                <input
                                  type="text"
                                  value={modelInput}
                                  onChange={(e) => {
                                    setModelInput(e.target.value);
                                    updateProvider({ selectedModel: e.target.value });
                                    setModelDropdownOpen(true);
                                  }}
                                  onFocus={() => setModelDropdownOpen(true)}
                                  onBlur={() => setTimeout(() => setModelDropdownOpen(false), 150)}
                                  placeholder="输入或选择模型"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white pr-7 truncate"
                                  title={currentConfig.selectedModel}
                                />
                                <button
                                  type="button"
                                  onClick={() => setModelDropdownOpen(prev => !prev)}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                  tabIndex={-1}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                                {modelDropdownOpen && filteredModels.length > 0 && (
                                  <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                    {filteredModels.map((m) => (
                                      <div
                                        key={m}
                                        onMouseDown={() => {
                                          setModelInput(m);
                                          updateProvider({ selectedModel: m });
                                          setModelDropdownOpen(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-xs cursor-pointer truncate ${
                                          m === currentConfig.selectedModel
                                            ? 'bg-blue-50 text-blue-700 font-medium'
                                            : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                        title={m}
                                      >
                                        {m}
                                        {safeFreeModels.includes(m) && (
                                          <span className="ml-1 text-[9px] text-green-600 font-normal">免费</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={handleFetchModels}
                                disabled={fetchingModels}
                                className="px-2 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50 shrink-0"
                                title="刷新模型列表"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                            {currentConfig.models.length > 0 && (
                              <div className="mt-1.5">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={showFreeOnly}
                                    onChange={(e) => {
                                      setShowFreeOnly(e.target.checked);
                                      if (e.target.checked && safeFreeModels.length > 0 && !safeFreeModels.includes(currentConfig.selectedModel)) {
                                        updateProvider({ selectedModel: safeFreeModels[0] });
                                        setModelInput(safeFreeModels[0]);
                                      }
                                    }}
                                    className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-[10px] text-slate-500">只显示免费模型</span>
                                  <span className="text-[10px] text-slate-400">({safeFreeModels.length}/{currentConfig.models.length})</span>
                                </label>
                                {showFreeOnly && safeFreeModels.length === 0 && (
                                  <p className="text-[10px] text-amber-500 mt-0.5">该提供商未返回免费模型信息，无法筛选</p>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={currentConfig.selectedModel}
                              onChange={(e) => updateProvider({ selectedModel: e.target.value })}
                              placeholder="输入模型名称，如 gpt-4o、deepseek-chat"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white truncate"
                            />
                            <button
                              onClick={handleFetchModels}
                              disabled={fetchingModels}
                              className="w-full px-2 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50 text-xs flex items-center justify-center gap-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                              {fetchingModels ? '获取中...' : '从 Provider 获取模型列表'}
                            </button>
                          </div>
                        )}
                        {fetchModelsError && (
                          <p className="text-[10px] text-red-500 mt-1">{fetchModelsError}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">可直接输入模型名，或点击按钮获取列表</p>
                      </div>

                      {/* Save to .env */}
                      <button
                        onClick={handleSaveConfig}
                        disabled={savingConfig || !currentConfig.selectedModel}
                        className={`w-full px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                          configSaved
                            ? 'bg-green-50 text-green-600 border border-green-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-300'
                        }`}
                      >
                        {configSaved ? (
                          <><Check className="w-3.5 h-3.5" /> 已保存到 .env</>
                        ) : savingConfig ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                        ) : (
                          <><Save className="w-3.5 h-3.5" /> 保存为服务器默认配置</>
                        )}
                      </button>
                      <p className="text-[10px] text-slate-400">保存后服务器重启也将保留此配置</p>
                    </>
                  )}

                  {activeProviderId === 'server' && (
                    <div className="text-xs text-slate-500 space-y-1">
                      <p>使用服务器 <code className="bg-slate-200 px-1 rounded">.env</code> 中配置的默认模型。</p>
                      {modelsInfo && (
                        <>
                          <p>Base URL: <code className="bg-slate-200 px-1 rounded text-[10px]">{modelsInfo.baseUrl}</code></p>
                          <p>模型: <code className="bg-slate-200 px-1 rounded text-[10px]">{modelsInfo.default}</code></p>
                          {modelsInfo.models.length > 1 && (
                            <div className="mt-1">
                              <label className="block text-xs font-medium text-slate-600 mb-1">选择模型</label>
                              <select
                                value={currentConfig.selectedModel}
                                onChange={(e) => updateProvider({ selectedModel: e.target.value })}
                                className="w-full min-w-0 px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white truncate"
                                title={currentConfig.selectedModel}
                              >
                                {modelsInfo.models.map((m) => (
                                  <option key={m} value={m} title={m}>{m}{m === modelsInfo.default ? ' (默认)' : ''}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          <button
                            onClick={handleSaveConfig}
                            disabled={savingConfig}
                            className={`w-full mt-2 px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                              configSaved
                                ? 'bg-green-50 text-green-600 border border-green-200'
                                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                            }`}
                          >
                            {configSaved ? (
                              <><Check className="w-3.5 h-3.5" /> 已保存</>
                            ) : savingConfig ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                            ) : (
                              <><Save className="w-3.5 h-3.5" /> 保存为默认</>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  您的岗位/角色 (可选)
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="例如：开发工程师、轧钢厂电气点检员"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {docType === 'proposal' ? '改善想法描述' : '项目需求描述'} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder={docType === 'proposal' 
                    ? "请描述您的问题和改进想法。例如：目前皮带巡检靠人工，效率低且有安全隐患，我想加装摄像头配合AI识别皮带跑偏..."
                    : "请描述您想开发的项目需求。例如：我们需要一个设备全生命周期管理系统，包含台账、点检、维修、备件功能..."}
                  className="w-full h-40 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm resize-none"
                />
                <p className="text-xs text-slate-500 mt-2">
                  提示：描述越具体，生成的内容越专业。
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={loading || !idea.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      生成{docType === 'proposal' ? '提案' : '文档'}
                    </>
                  )}
                </button>
                <button
                  onClick={handleClear}
                  disabled={loading}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  title="清空"
                >
                  <Eraser className="w-4 h-4" />
                </button>
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Manual Input Fields for the Form - Only for Proposal */}
          {docType === 'proposal' && proposal && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold mb-4">完善信息</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">提案人</label>
                  <input 
                    type="text" 
                    value={proposer} 
                    onChange={e => setProposer(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">单位及岗位</label>
                  <input 
                    type="text" 
                    value={unit} 
                    onChange={e => setUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">协助人/部门</label>
                  <input 
                    type="text" 
                    value={assistant} 
                    onChange={e => setAssistant(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1">完成时限</label>
                  <input 
                    type="text" 
                    value={deadline} 
                    onChange={e => setDeadline(e.target.value)}
                    placeholder="202X年X月X日前"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Output Section - The "Paper" */}
        <section className="w-full md:flex-1">
          <div className="flex justify-between items-center mb-4 print:hidden">
            <h2 className="text-lg font-semibold text-slate-800">
              {docType === 'proposal' ? '提案预览' : '文档预览'}
            </h2>
            <div className="flex gap-2">
              {docType === 'proposal' && proposal && !loading && (
                <button
                  onClick={handleGenerateReqsFromProposal}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
                >
                  <FileJson className="w-4 h-4" />
                  生成需求文档
                </button>
              )}
              {(proposal || requirements) && (
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors px-3 py-1.5"
                  >
                    <FileDown className="w-4 h-4" />
                    导出
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 min-w-[160px]">
                      <button
                        onClick={() => { handlePrint(); setShowExportMenu(false); }}
                        className="w-full flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 px-4 py-2"
                      >
                        <Printer className="w-4 h-4" />
                        打印 / 存为PDF
                      </button>
                      <button
                        onClick={() => { handleExportMD(); setShowExportMenu(false); }}
                        className="w-full flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 px-4 py-2"
                      >
                        <Download className="w-4 h-4" />
                        导出 Markdown
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white shadow-lg print:shadow-none w-full max-w-none mx-auto min-h-[297mm] p-[15mm] print:p-0 print:max-w-[210mm] relative">
            {/* Paper Content */}
            {!proposal && !requirements ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl p-12">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <p>请在左侧输入想法并生成{docType === 'proposal' ? '提案' : '文档'}</p>
              </div>
            ) : docType === 'proposal' ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-black font-serif w-full print:w-full"
              >
                {/* Header */}
                <div className="flex justify-between items-end mb-2">
                  <div className="text-sm font-bold">附件二</div>
                  <div className="text-xl font-bold tracking-wide">202X 年 XX 月“月度精益改善自主性提案”</div>
                </div>

                {/* Table */}
                <div className="border-2 border-black w-full">
                  {/* Row 1: Name & Scope */}
                  <div className="flex border-b border-black">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      提案名称
                    </div>
                    <div className="flex-1 p-2 flex items-center text-sm">
                      {proposal?.proposalName || (loading && <span className="animate-pulse bg-slate-200 h-4 w-32 rounded"></span>)}
                    </div>
                    <div className="w-20 p-2 border-l border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      提案范围
                    </div>
                    <div className="flex-1 p-2 flex items-center text-xs">
                      {proposal?.proposalScope || (loading && <span className="animate-pulse bg-slate-200 h-4 w-24 rounded"></span>)}
                    </div>
                  </div>

                  {/* Row 2: Proposer & Unit */}
                  <div className="flex border-b border-black">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      提案人
                    </div>
                    <div className="flex-1 p-2 flex items-center text-sm">
                      {proposer}
                    </div>
                    <div className="w-20 p-2 border-l border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      单位及<br/>岗位
                    </div>
                    <div className="flex-1 p-2 flex items-center text-sm">
                      {unit}
                    </div>
                  </div>

                  {/* Row 3: Assistant & Deadline */}
                  <div className="flex border-b border-black">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      协助人/<br/>部门
                    </div>
                    <div className="flex-1 p-2 flex items-center text-sm">
                      {assistant}
                    </div>
                    <div className="w-20 p-2 border-l border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      完成时限
                    </div>
                    <div className="flex-1 p-2 flex items-center text-sm">
                      {deadline}
                    </div>
                  </div>

                  {/* Row 4: Current Status */}
                  <div className="flex border-b border-black min-h-[120px]">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      现状或<br/>问题
                    </div>
                    <div className="flex-1 p-3 whitespace-pre-wrap leading-relaxed text-sm">
                      {stripMarkdown(proposal?.currentStatus || '') || (loading && (
                        <div className="space-y-2">
                          <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                          <div className="animate-pulse bg-slate-200 h-4 w-5/6 rounded"></div>
                          <div className="animate-pulse bg-slate-200 h-4 w-4/6 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Row 5: Expected Goals */}
                  <div className="flex border-b border-black min-h-[100px]">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      预期目标<br/>或效果
                    </div>
                    <div className="flex-1 p-3 whitespace-pre-wrap leading-relaxed text-sm">
                      {stripMarkdown(proposal?.expectedGoals || '') || (loading && proposal?.currentStatus && (
                        <div className="space-y-2">
                          <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                          <div className="animate-pulse bg-slate-200 h-4 w-3/4 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Row 6: Measures */}
                  <div className="flex border-b border-black min-h-[200px]">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      计划或<br/>措施
                    </div>
                    <div className="flex-1 p-3 whitespace-pre-wrap leading-relaxed text-sm">
                      {stripMarkdown(proposal?.measures || '') || (loading && proposal?.expectedGoals && (
                        <div className="space-y-2">
                          <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                          <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                          <div className="animate-pulse bg-slate-200 h-4 w-5/6 rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Row 7: Budget */}
                  <div className="flex border-b border-black min-h-[80px]">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      资金预算
                    </div>
                    <div className="flex-1 p-3 whitespace-pre-wrap leading-relaxed text-sm">
                      {stripMarkdown(proposal?.budget || '') || (loading && proposal?.measures && (
                        <div className="space-y-2">
                          <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Row 8: Professional Opinion */}
                  <div className="flex border-b border-black min-h-[80px]">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      专业部室<br/>/科室<br/>意见
                    </div>
                    <div className="flex-1 p-2 border-r border-black"></div>
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      主管领<br/>导意见
                    </div>
                    <div className="flex-1 p-2"></div>
                  </div>

                  {/* Row 9: Remarks */}
                  <div className="flex min-h-[60px]">
                    <div className="w-20 p-2 border-r border-black font-bold flex items-center justify-center bg-gray-50 text-center text-sm">
                      备注
                    </div>
                    <div className="flex-1 p-2"></div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-black font-sans print:w-full"
              >
                <div className="mb-8 border-b-2 border-black pb-4">
                  <h1 className="text-3xl font-bold text-center mb-2">{requirements?.projectName || (loading ? "项目需求规格说明书" : "")}</h1>
                  <p className="text-center text-gray-500">项目需求规格说明书 (PRD)</p>
                </div>

                <div className="space-y-8">
                  <section>
                    <h2 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-3">1. 项目背景与痛点</h2>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                      {requirements?.background || (loading && <div className="space-y-2">
                        <div className="animate-pulse bg-slate-100 h-4 w-full rounded"></div>
                        <div className="animate-pulse bg-slate-100 h-4 w-5/6 rounded"></div>
                      </div>)}
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-3">2. 目标用户</h2>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                      {requirements?.targetUsers || (loading && requirements?.background && <div className="animate-pulse bg-slate-100 h-4 w-1/2 rounded"></div>)}
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-3">3. 功能需求</h2>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800 bg-slate-50 p-4 rounded-lg border border-slate-100">
                      {requirements?.functionalRequirements || (loading && requirements?.targetUsers && <div className="space-y-2">
                        <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                        <div className="animate-pulse bg-slate-200 h-4 w-full rounded"></div>
                        <div className="animate-pulse bg-slate-200 h-4 w-3/4 rounded"></div>
                      </div>)}
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-3">4. 非功能需求</h2>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                      {requirements?.nonFunctionalRequirements || (loading && requirements?.functionalRequirements && <div className="space-y-2">
                        <div className="animate-pulse bg-slate-100 h-4 w-full rounded"></div>
                        <div className="animate-pulse bg-slate-100 h-4 w-2/3 rounded"></div>
                      </div>)}
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-3">5. 实施路线图</h2>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                      {requirements?.roadmap || (loading && requirements?.nonFunctionalRequirements && <div className="space-y-2">
                        <div className="animate-pulse bg-slate-100 h-4 w-full rounded"></div>
                        <div className="animate-pulse bg-slate-100 h-4 w-2/3 rounded"></div>
                      </div>)}
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-3">6. 成功衡量指标</h2>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                      {requirements?.successMetrics || (loading && requirements?.roadmap && <div className="animate-pulse bg-slate-100 h-4 w-full rounded"></div>)}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}
          </div>
        </section>
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            background: white;
            color: black;
          }
          /* Hide everything except the print container */
          body > *:not(#root) {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
