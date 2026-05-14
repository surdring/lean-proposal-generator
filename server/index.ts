import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Mutable runtime config (can be updated via /api/save-config)
let AI_API_KEY = process.env.AI_API_KEY || 'sk-no-key';
let AI_BASE_URL = process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
let AI_MODEL = process.env.AI_MODEL || 'gemini-2.0-flash';

// Configurable model list: comma-separated in AI_MODELS env var, or defaults based on provider
let AI_MODELS = process.env.AI_MODELS
  ? process.env.AI_MODELS.split(',').map(s => s.trim()).filter(Boolean)
  : [AI_MODEL];

// Create an OpenAI client with optional overrides
function createClient(apiKey?: string, baseUrl?: string) {
  return new OpenAI({
    apiKey: apiKey || AI_API_KEY,
    baseURL: baseUrl || AI_BASE_URL,
  });
}

// Scan PROVIDER_* env vars into presets (auto-mapped, no code changes needed to add providers)
interface ServerProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  needsApiKey: boolean;
  defaultApiKey?: string;
}

function scanProviderPresets(): ServerProviderPreset[] {
  const map: Record<string, ServerProviderPreset> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('PROVIDER_')) continue;
    // API_KEY can be empty string (meaning not needed), so allow empty for API_KEY only
    if (value === undefined) continue;
    const rest = key.substring('PROVIDER_'.length); // e.g. OPENAI_BASE_URL
    const firstUnderscore = rest.indexOf('_');
    if (firstUnderscore === -1) continue;
    const id = rest.substring(0, firstUnderscore).toLowerCase();
    const field = rest.substring(firstUnderscore + 1);
    if (!map[id]) map[id] = { id, name: '', baseUrl: '', needsApiKey: true };
    if (field === 'NAME') map[id].name = value;
    else if (field === 'BASE_URL') map[id].baseUrl = value;
    else if (field === 'API_KEY') {
      // Empty string = not needed; omitted = required but no default; non-empty = default value
      if (value === '') {
        map[id].needsApiKey = false;
      } else {
        map[id].needsApiKey = true;
        map[id].defaultApiKey = value;
      }
    }
  }
  return Object.values(map).filter(p => p.name);
}

const PROVIDER_PRESETS = scanProviderPresets();

app.use(express.json());

// --- Models endpoint ---
app.get('/api/models', (_req, res) => {
  res.json({
    default: AI_MODEL,
    models: AI_MODELS,
    baseUrl: AI_BASE_URL,
    hasApiKey: !!AI_API_KEY && AI_API_KEY !== 'sk-no-key',
    providerPresets: PROVIDER_PRESETS,
  });
});

// --- Save config to .env ---
const ENV_PATH = path.resolve(process.cwd(), '.env');

app.post('/api/save-config', (req, res) => {
  const { apiKey, baseUrl, model, models } = req.body;

  // Read existing .env content
  let envContent = '';
  try {
    envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  } catch {
    // .env may not exist yet
  }

  const lines = envContent.split('\n');
  const updated: Record<string, string> = {};

  if (apiKey !== undefined) updated.AI_API_KEY = apiKey;
  if (baseUrl !== undefined) updated.AI_BASE_URL = baseUrl;
  if (model !== undefined) updated.AI_MODEL = model;
  if (models !== undefined) updated.AI_MODELS = models;

  // Update lines: replace existing keys or append
  const keySet = new Set(Object.keys(updated));
  const newLines: string[] = [];
  const handled = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines as-is
    if (trimmed.startsWith('#') || trimmed === '') {
      newLines.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      newLines.push(line);
      continue;
    }
    const key = trimmed.substring(0, eqIdx).trim();
    if (keySet.has(key)) {
      // Replace with new value
      const val = updated[key];
      newLines.push(`${key}="${val}"`);
      handled.add(key);
    } else {
      newLines.push(line);
    }
  }

  // Append any keys not found in existing file
  for (const key of Object.keys(updated)) {
    if (!handled.has(key)) {
      newLines.push(`${key}="${updated[key]}"`);
    }
  }

  const newContent = newLines.join('\n');

  try {
    fs.writeFileSync(ENV_PATH, newContent, 'utf-8');

    // Update runtime config
    if (apiKey !== undefined) AI_API_KEY = apiKey;
    if (baseUrl !== undefined) AI_BASE_URL = baseUrl;
    if (model !== undefined) AI_MODEL = model;
    if (models !== undefined) AI_MODELS = models.split(',').map((s: string) => s.trim()).filter(Boolean);

    console.log(`Config saved to .env: model=${AI_MODEL}, baseUrl=${AI_BASE_URL}`);
    res.json({ success: true, config: { apiKey: AI_API_KEY, baseUrl: AI_BASE_URL, model: AI_MODEL, models: AI_MODELS } });
  } catch (err: any) {
    console.error('Error saving config:', err);
    res.status(500).json({ error: err.message || 'Failed to save config' });
  }
});

// --- Fetch models from provider ---
app.post('/api/fetch-models', async (req, res) => {
  const { apiKey, baseUrl } = req.body;
  try {
    const tempClient = createClient(apiKey, baseUrl);
    const models = await tempClient.models.list();
    const seen = new Set<string>();
    const allIds: string[] = [];
    const freeIds: string[] = [];
    // Sort by id first
    const sorted = [...models.data].sort((a: any, b: any) => a.id.localeCompare(b.id));
    // Debug: log first model's available fields to help identify free model markers
    if (sorted.length > 0) {
      const sample = sorted[0] as any;
      console.log(`[fetch-models] Sample model fields (${baseUrl}): id=${sample.id}, keys=${Object.keys(sample).join(',')}, pricing=${JSON.stringify(sample.pricing)}, tags=${JSON.stringify(sample.tags)}, metadata=${JSON.stringify(sample.metadata)}`);
    }
    for (const m of sorted) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      allIds.push(m.id);
      // Detect free models across providers:
      // 1. OpenRouter: pricing.prompt === "0" or pricing.completion === "0"
      // 2. OpenRouter / SiliconFlow: model ID ends with ":free"
      // 3. NVIDIA NIM: some models have "free" in metadata or tags
      // 4. Generic: check common fields (is_free, free, metadata.free)
      const obj = m as any;
      const id = m.id;
      const pricing = obj.pricing;
      const metadata = obj.metadata;
      const tags: string[] = obj.tags || [];
      const isFree =
        // OpenRouter pricing
        (pricing && (pricing.prompt === '0' || pricing.completion === '0')) ||
        // :free suffix (OpenRouter, SiliconFlow)
        id.endsWith(':free') ||
        // NVIDIA NIM: tags contains "free"
        tags.some((t: string) => t.toLowerCase() === 'free') ||
        // NVIDIA NIM: metadata.free
        (metadata && metadata.free === true) ||
        // Generic fields
        obj.is_free === true ||
        obj.free === true;
      if (isFree) freeIds.push(id);
    }
    res.json({ models: allIds, freeModels: freeIds });
  } catch (error: any) {
    console.error('Error fetching models:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch models' });
  }
});

// --- Test model endpoint ---
app.post('/api/test-model', async (req, res) => {
  const { model: reqModel, apiKey: reqApiKey, baseUrl: reqBaseUrl } = req.body;
  const useModel = reqModel || AI_MODEL;
  try {
    const useClient = createClient(reqApiKey, reqBaseUrl);
    const start = Date.now();
    const completion = await useClient.chat.completions.create({
      model: useModel,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    });
    const latency = Date.now() - start;
    const reply = completion.choices[0]?.message?.content || '(empty)';
    res.json({ success: true, latency, reply, model: useModel });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Unknown error', model: useModel });
  }
});

// SSE helper
function sendSSE(res: express.Response, event: string, data: string) {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

// --- Proposal generation endpoint ---
app.post('/api/generate-proposal', async (req, res) => {
  const { idea, role, model: reqModel, apiKey: reqApiKey, baseUrl: reqBaseUrl } = req.body;
  if (!idea) {
    res.status(400).json({ error: 'idea is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const TAGS = {
    proposalName: "===PROPOSAL_NAME===",
    proposalScope: "===PROPOSAL_SCOPE===",
    currentStatus: "===CURRENT_STATUS===",
    expectedGoals: "===EXPECTED_GOALS===",
    measures: "===MEASURES===",
    budget: "===BUDGET==="
  };

  const userRole = role || '员工';

  const prompt = `
你是一个精益改善专家。请根据用户提供的原始想法，按照《月度精益改善自主性提案》的格式要求，生成一份专业的提案内容。

【核心原则】
1.  **切入视角**：摒弃"纠错找茬"，从"机会与增值"出发。立足现有基础，阐述如何通过改善手段实现从"合格"到"卓越"的跨越。
2.  **落地可行性**：坚持"我提报、我实施"。方案必须切实可行，具体到工具开发、流程优化或系统升级的动作。避免宏大理论。
3.  **文风控制（去AI化）**：
    *   **严禁使用**："革命性"、"颠覆性"、"赋能"、"全方位"、"重塑"、"彻底解决"等虚浮词汇。
    *   **语言风格**：朴实、干练、专业，符合用户所在岗位的实际工作语境。
    *   **数据支撑**：必须包含预估数据（如：效率提升15%，人工减少2小时/天，成本降低5万元/年）。

【输入信息】
用户角色：${userRole}
用户想法：${idea}

【输出格式要求】
请**严格**按照以下标记格式输出内容，不要输出任何Markdown代码块标记，也不要输出JSON。请直接输出文本。
每个部分以特定的标记开始，内容紧随其后。

${TAGS.proposalName}
(在此处填写提案名称：简练，包含智能化/数字化要素)
${TAGS.proposalScope}
(在此处填写提案范围：从以下类别中选择最匹配的一项——生产及设备效率改善、产品品质及价值改善、营销绩效改善、节约能源改善、配方用料改善、人员合理化改善、工作方法改善、安全环保改善、管理制度及使用表单改善、研发协同与工具改善、其他降低成本/提升经营绩效的改善)
${TAGS.currentStatus}
(在此处填写现状分析：简述当前基础，指出提升空间)
${TAGS.expectedGoals}
(在此处填写预期目标/效果：量化指标 + 定性提升)
${TAGS.measures}
(在此处填写计划或措施：分步骤列出实施路径，包含技术手段、硬件/软件需求、时间节点)
${TAGS.budget}
(在此处填写资金预算：预估大致投入范围，需体现高性价比)
`;

  try {
    const useModel = reqModel || AI_MODEL;
    const useClient = createClient(reqApiKey, reqBaseUrl);
    console.log(`Generating proposal with model: ${useModel}, baseUrl: ${reqBaseUrl || AI_BASE_URL}`);
    const stream = await useClient.chat.completions.create({
      model: useModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        sendSSE(res, 'chunk', JSON.stringify({ text: fullText }));
      }
    }
    sendSSE(res, 'done', '');
    res.end();
  } catch (error: any) {
    console.error('Error generating proposal:', error);
    sendSSE(res, 'error', JSON.stringify({ message: error.message || 'Unknown error' }));
    res.end();
  }
});

// --- Requirements generation endpoint ---
app.post('/api/generate-requirements', async (req, res) => {
  const { idea, role, proposalContext, model: reqModel, apiKey: reqApiKey, baseUrl: reqBaseUrl } = req.body;
  if (!idea) {
    res.status(400).json({ error: 'idea is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const REQ_TAGS = {
    projectName: "===PROJECT_NAME===",
    background: "===BACKGROUND===",
    targetUsers: "===TARGET_USERS===",
    functionalRequirements: "===FUNCTIONAL_REQS===",
    nonFunctionalRequirements: "===NON_FUNCTIONAL_REQS===",
    roadmap: "===ROADMAP===",
    successMetrics: "===SUCCESS_METRICS==="
  };

  const userRole = role || '员工';

  let prompt = `
你是一个数字化转型专家和产品经理。请根据用户提供的原始想法`;

  if (proposalContext) {
    prompt += `以及已生成的改善提案内容，生成一份结构清晰、内容专业的《项目需求规格说明书》（PRD）。确保需求文档与提案内容（如项目名称、目标、措施）保持一致。

【参考提案信息】
提案名称：${proposalContext.proposalName || '未定'}
现状分析：${proposalContext.currentStatus || '未定'}
预期目标：${proposalContext.expectedGoals || '未定'}
计划措施：${proposalContext.measures || '未定'}
`;
  } else {
    prompt += `，生成一份结构清晰、内容专业的《项目需求规格说明书》（PRD）。`;
  }

  prompt += `

【核心原则】
1.  **专业性**：使用与用户岗位匹配的专业术语，确保逻辑通顺。
2.  **结构化**：内容必须条理清晰，适合开发团队或供应商阅读。
3.  **场景适配**：充分考虑用户所在行业和岗位的实际工作环境与约束条件。

【输入信息】
用户角色：${userRole}
用户想法：${idea}

【输出格式要求】
请**严格**按照以下标记格式输出内容，不要输出任何Markdown代码块标记，也不要输出JSON。请直接输出文本。
每个部分以特定的标记开始，内容紧随其后。

${REQ_TAGS.projectName}
(在此处填写项目名称：专业、科技感强。若参考提案中有名称，请保持一致或进行专业化润色)
${REQ_TAGS.background}
(在此处填写项目背景与痛点：分析当前业务流程的问题，以及为什么要立项)
${REQ_TAGS.targetUsers}
(在此处填写目标用户：谁会使用这个系统？例如：开发工程师、调度员、点检员、部门经理)
${REQ_TAGS.functionalRequirements}
(在此处填写功能需求：列出核心功能点，使用列表形式。例如：1. 项目信息管理... 2. 数据采集... 3. 异常报警...)
${REQ_TAGS.nonFunctionalRequirements}
(在此处填写非功能需求：性能、安全、可靠性、易用性等。例如：响应时间<500ms，支持本地部署无需联网)
${REQ_TAGS.roadmap}
(在此处填写实施路线图：分阶段实施计划)
${REQ_TAGS.successMetrics}
(在此处填写成功衡量指标：如何判断项目成功？例如：操作耗时缩短50%，信息查找时间减少80%)
`;

  try {
    const useModel = reqModel || AI_MODEL;
    const useClient = createClient(reqApiKey, reqBaseUrl);
    console.log(`Generating requirements with model: ${useModel}, baseUrl: ${reqBaseUrl || AI_BASE_URL}`);
    const stream = await useClient.chat.completions.create({
      model: useModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        sendSSE(res, 'chunk', JSON.stringify({ text: fullText }));
      }
    }
    sendSSE(res, 'done', '');
    res.end();
  } catch (error: any) {
    console.error('Error generating requirements:', error);
    sendSSE(res, 'error', JSON.stringify({ message: error.message || 'Unknown error' }));
    res.end();
  }
});

// Serve static files in production
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Lean Proposal Generator 服务已启动: http://localhost:${PORT}`);
  console.log(`   API Base URL: ${AI_BASE_URL}`);
  console.log(`   Model: ${AI_MODEL}`);
  console.log(`   API Key: ${AI_API_KEY ? AI_API_KEY.slice(0, 8) + '...' : '(empty)'}`);
});
