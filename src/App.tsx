import React, { useState, useRef, useEffect } from 'react';
import { generateProposalStream, generateRequirementsStream, ProposalData, RequirementsData } from './services/geminiService';
import { ModelConfig, useModelConfig } from './components/model-config';
import { Loader2, Printer, Sparkles, FileText, Eraser, Download, FileJson, FileDown, ChevronDown, Settings, X } from 'lucide-react';
import { motion } from 'motion/react';

type DocType = 'proposal' | 'requirements';

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

  // AI Model Config (reusable module)
  const modelConfig = useModelConfig();
  const { effectiveConfig } = modelConfig;

  // Settings modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Close modal on Esc
  useEffect(() => {
    if (!settingsModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsModalOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [settingsModalOpen]);

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
      console.log('[AI] 当前使用模型:', effectiveConfig.model || '(默认)', '| 提供商:', modelConfig.activeProviderId, '| BaseURL:', effectiveConfig.baseUrl);
      try {
        await generateProposalStream(
          idea, 
          role || '员工',
          (data) => {
            setProposal(prev => ({ ...prev, ...data }));
          },
          effectiveConfig.model || undefined,
          effectiveConfig.apiKey || undefined,
          effectiveConfig.baseUrl || undefined
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
          effectiveConfig.model || undefined,
          effectiveConfig.apiKey || undefined,
          effectiveConfig.baseUrl || undefined
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
        effectiveConfig.model || undefined,
        effectiveConfig.apiKey || undefined,
        effectiveConfig.baseUrl || undefined
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
              <h1 className="text-xl font-bold tracking-tight">Lean Proposal Generator</h1>
              <p className="text-slate-400 text-xs mt-0.5">基于《月度精益改善自主性提案》标准模板</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-sm"
              title="AI 模型配置"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">设置</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-8">
        
        {/* Input Section - Hidden on Print */}
        <section className="w-full md:w-80 flex-shrink-0 flex flex-col print:hidden" style={{ maxHeight: 'calc(100vh - 80px)', position: 'sticky', top: '80px' }}>
          <div className="flex-1 overflow-y-auto space-y-6 pb-4">
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
            
            {/* Divider before content input */}
            <div className="border-t border-slate-200 my-2" />

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  您的岗位/角色 <span className="text-slate-400 font-normal text-xs">(选填)</span>
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
                <div className="relative">
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder={docType === 'proposal' 
                      ? "请描述您的问题和改进想法。例如：目前皮带巡检靠人工，效率低且有安全隐患，我想加装摄像头配合AI识别皮带跑偏..."
                      : "请描述您想开发的项目需求。例如：我们需要一个设备全生命周期管理系统，包含台账、点检、维修、备件功能..."}
                    className="w-full min-h-[160px] px-3 py-2 pb-7 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm resize-none"
                  />
                  <div className="absolute bottom-2 right-3 flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{idea.length}/500</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  描述越具体，生成的内容越专业
                </p>
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
          </div>

          {/* Sticky CTA Button */}
          <div className="sticky bottom-0 pt-3 pb-1 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={loading || !idea.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
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
                className="px-3 py-2.5 border border-slate-300 text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-colors"
                title="清空"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>
          </div>
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

      {/* Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center print:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSettingsModalOpen(false)}
          />
          {/* Dialog */}
          <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 max-h-[85vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                AI 模型配置
              </h3>
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ModelConfig config={modelConfig} variant="modal-content" onDone={() => setSettingsModalOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
