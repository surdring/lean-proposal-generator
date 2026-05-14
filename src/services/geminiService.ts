export interface ProposalData {
  proposalName: string;
  proposalScope: string;
  currentStatus: string;
  expectedGoals: string;
  measures: string;
  budget: string;
}

const TAGS = {
  proposalName: "===PROPOSAL_NAME===",
  proposalScope: "===PROPOSAL_SCOPE===",
  currentStatus: "===CURRENT_STATUS===",
  expectedGoals: "===EXPECTED_GOALS===",
  measures: "===MEASURES===",
  budget: "===BUDGET==="
};

export const generateProposalStream = async (
  userIdea: string,
  userRole: string = "一线员工",
  onUpdate: (data: Partial<ProposalData>) => void,
  model?: string,
  apiKey?: string,
  baseUrl?: string
): Promise<void> => {
  const response = await fetch('/api/generate-proposal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea: userIdea, role: userRole, model, apiKey, baseUrl }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const currentData: Partial<ProposalData> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.slice(7).trim();
        if (eventType === 'done') return;
        if (eventType === 'error') {
          // Next data line will contain the error
        }
      }
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            parseAndNotify(parsed.text, currentData, onUpdate);
          }
        } catch {
          // ignore non-JSON data lines
        }
      }
    }
  }
};

function parseAndNotify(
  text: string, 
  currentData: Partial<ProposalData>, 
  onUpdate: (data: Partial<ProposalData>) => void
) {
  // Helper to extract content between tags
  const extract = (tag: string, nextTag?: string) => {
    const startIndex = text.indexOf(tag);
    if (startIndex === -1) return null;
    
    const contentStart = startIndex + tag.length;
    let contentEnd = text.length;
    
    if (nextTag) {
      const nextIndex = text.indexOf(nextTag);
      if (nextIndex !== -1) {
        contentEnd = nextIndex;
      }
    }
    
    return text.substring(contentStart, contentEnd).trim();
  };

  // Order of tags in the prompt
  const tagOrder = [
    TAGS.proposalName,
    TAGS.proposalScope,
    TAGS.currentStatus,
    TAGS.expectedGoals,
    TAGS.measures,
    TAGS.budget
  ];

  // Extract fields based on known tags
  // We check each tag. If it exists, we try to find the content up to the next existing tag.
  
  if (text.includes(TAGS.proposalName)) {
    const val = extract(TAGS.proposalName, TAGS.proposalScope);
    if (val) currentData.proposalName = val;
  }
  
  if (text.includes(TAGS.proposalScope)) {
    const val = extract(TAGS.proposalScope, TAGS.currentStatus);
    if (val) currentData.proposalScope = val;
  }

  if (text.includes(TAGS.currentStatus)) {
    const val = extract(TAGS.currentStatus, TAGS.expectedGoals);
    if (val) currentData.currentStatus = val;
  }

  if (text.includes(TAGS.expectedGoals)) {
    const val = extract(TAGS.expectedGoals, TAGS.measures);
    if (val) currentData.expectedGoals = val;
  }

  if (text.includes(TAGS.measures)) {
    const val = extract(TAGS.measures, TAGS.budget);
    if (val) currentData.measures = val;
  }

  if (text.includes(TAGS.budget)) {
    // Budget is the last one, so it goes to the end of the text
    const val = extract(TAGS.budget);
    if (val) currentData.budget = val;
  }

  onUpdate({ ...currentData });
}

// --- Fetch available models ---
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

export const fetchModels = async (): Promise<ModelsInfo> => {
  const response = await fetch('/api/models');
  if (!response.ok) throw new Error(`Server error: ${response.status}`);
  return response.json();
};

// --- Fetch models from a specific provider ---
export interface FetchedModels {
  models: string[];
  freeModels: string[];
}

export const fetchModelsFromProvider = async (apiKey?: string, baseUrl?: string): Promise<FetchedModels> => {
  const response = await fetch('/api/fetch-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, baseUrl }),
  });
  if (!response.ok) throw new Error(`Server error: ${response.status}`);
  const data = await response.json();
  return { models: data.models || [], freeModels: data.freeModels || [] };
};

// --- Save config to server .env ---
export interface SavedConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  models: string[];
}

export const saveConfig = async (config: { apiKey?: string; baseUrl?: string; model?: string; models?: string }): Promise<SavedConfig> => {
  const response = await fetch('/api/save-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error(`Server error: ${response.status}`);
  const data = await response.json();
  return data.config;
};

export interface RequirementsData {
  projectName: string;
  background: string;
  targetUsers: string;
  functionalRequirements: string;
  nonFunctionalRequirements: string;
  roadmap: string;
  successMetrics: string;
}

const REQ_TAGS = {
  projectName: "===PROJECT_NAME===",
  background: "===BACKGROUND===",
  targetUsers: "===TARGET_USERS===",
  functionalRequirements: "===FUNCTIONAL_REQS===",
  nonFunctionalRequirements: "===NON_FUNCTIONAL_REQS===",
  roadmap: "===ROADMAP===",
  successMetrics: "===SUCCESS_METRICS==="
};

export const generateRequirementsStream = async (
  userIdea: string,
  userRole: string = "一线员工",
  proposalContext: Partial<ProposalData> | null = null,
  onUpdate: (data: Partial<RequirementsData>) => void,
  model?: string,
  apiKey?: string,
  baseUrl?: string
): Promise<void> => {
  const response = await fetch('/api/generate-requirements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea: userIdea, role: userRole, proposalContext, model, apiKey, baseUrl }),
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const currentData: Partial<RequirementsData> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.slice(7).trim();
        if (eventType === 'done') return;
        if (eventType === 'error') {
          // Next data line will contain the error
        }
      }
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            parseAndNotifyRequirements(parsed.text, currentData, onUpdate);
          }
        } catch {
          // ignore non-JSON data lines
        }
      }
    }
  }
};

function parseAndNotifyRequirements(
  text: string,
  currentData: Partial<RequirementsData>,
  onUpdate: (data: Partial<RequirementsData>) => void
) {
  // Helper to extract content between tags
  const extract = (tag: string, nextTag?: string) => {
    const startIndex = text.indexOf(tag);
    if (startIndex === -1) return null;

    const contentStart = startIndex + tag.length;
    let contentEnd = text.length;

    if (nextTag) {
      const nextIndex = text.indexOf(nextTag);
      if (nextIndex !== -1) {
        contentEnd = nextIndex;
      }
    }

    return text.substring(contentStart, contentEnd).trim();
  };

  if (text.includes(REQ_TAGS.projectName)) {
    const val = extract(REQ_TAGS.projectName, REQ_TAGS.background);
    if (val) currentData.projectName = val;
  }

  if (text.includes(REQ_TAGS.background)) {
    const val = extract(REQ_TAGS.background, REQ_TAGS.targetUsers);
    if (val) currentData.background = val;
  }

  if (text.includes(REQ_TAGS.targetUsers)) {
    const val = extract(REQ_TAGS.targetUsers, REQ_TAGS.functionalRequirements);
    if (val) currentData.targetUsers = val;
  }

  if (text.includes(REQ_TAGS.functionalRequirements)) {
    const val = extract(REQ_TAGS.functionalRequirements, REQ_TAGS.nonFunctionalRequirements);
    if (val) currentData.functionalRequirements = val;
  }

  if (text.includes(REQ_TAGS.nonFunctionalRequirements)) {
    const val = extract(REQ_TAGS.nonFunctionalRequirements, REQ_TAGS.roadmap);
    if (val) currentData.nonFunctionalRequirements = val;
  }

  if (text.includes(REQ_TAGS.roadmap)) {
    const val = extract(REQ_TAGS.roadmap, REQ_TAGS.successMetrics);
    if (val) currentData.roadmap = val;
  }

  if (text.includes(REQ_TAGS.successMetrics)) {
    const val = extract(REQ_TAGS.successMetrics);
    if (val) currentData.successMetrics = val;
  }

  onUpdate({ ...currentData });
}

export interface TestModelResult {
  success: boolean;
  latency?: number;
  reply?: string;
  model?: string;
  error?: string;
}

export const testModel = async (
  model?: string,
  apiKey?: string,
  baseUrl?: string
): Promise<TestModelResult> => {
  const response = await fetch('/api/test-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, apiKey, baseUrl }),
  });

  const data = await response.json();
  return data;
};
