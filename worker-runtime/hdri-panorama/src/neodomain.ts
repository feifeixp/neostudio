// Neodomain API client

// 开发时走 vite proxy，生产时走 FC Worker 代理（避免 CORS）
const BASE_URL = import.meta.env.DEV
  ? '/neo-api'
  : (import.meta.env.VITE_FC_PROXY_URL || 'https://fc-worker-dnqpfnoxtc.cn-hangzhou.fcapp.run') + '/neo-api';

// --- Types ---

export interface Identity {
  userId: string;
  nickname: string;
  avatar: string;
  userType: string;
  enterpriseId: string;
}

export interface LoginIdentityResponse {
  data: {
    needSelectIdentity: boolean;
    identities: Identity[];
  };
}

export interface SelectIdentityResponse {
  data: {
    authorization: string;
    userId: string;
    nickname: string;
  };
}

export interface ImageModel {
  model_name: string;
  model_display_name: string;
  model_description: string;
  supported_aspect_ratios: string[];
  image_count_options: number[];
  supported_sizes: string[];
}

export interface GenerateImageParams {
  prompt: string;
  modelName: string;
  aspectRatio?: string;
  numImages?: string;
  outputFormat?: string;
  syncMode?: boolean;
  size?: string;
}

export interface GenerateImageResponse {
  data: {
    task_code: string;
    status: string;
  };
}

export interface PollResultResponse {
  data: {
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    image_urls: string[];
  };
}

// --- API methods ---

export async function sendCode(contact: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/user/login/send-unified-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send code: ${text}`);
  }
}

export async function login(contact: string, code: string): Promise<LoginIdentityResponse> {
  const res = await fetch(`${BASE_URL}/user/login/unified-login/identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact, code }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${text}`);
  }
  return res.json();
}

export async function selectIdentity(
  userId: string,
  contact: string,
): Promise<SelectIdentityResponse> {
  const res = await fetch(`${BASE_URL}/user/login/select-identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, contact }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Select identity failed: ${text}`);
  }
  return res.json();
}

export async function getModels(accessToken: string, userId: string): Promise<ImageModel[]> {
  const res = await fetch(
    `${BASE_URL}/agent/ai-image-generation/models/by-scenario?scenarioType=1&userId=${encodeURIComponent(userId)}`,
    {
      headers: { accessToken },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch models: ${text}`);
  }
  const json = await res.json();
  // The response may be wrapped in data or be a direct array
  return Array.isArray(json) ? json : json.data ?? [];
}

export async function generateImage(
  accessToken: string,
  params: GenerateImageParams,
): Promise<GenerateImageResponse> {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    modelName: params.modelName,
    aspectRatio: params.aspectRatio ?? '2:1',
    numImages: params.numImages ?? '1',
    outputFormat: params.outputFormat ?? 'jpeg',
    syncMode: params.syncMode ?? false,
    size: params.size ?? '2K',
  };

  const res = await fetch(`${BASE_URL}/agent/ai-image-generation/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accessToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image generation failed: ${text}`);
  }
  return res.json();
}

export async function pollResult(
  accessToken: string,
  taskCode: string,
  maxWaitMs = 120_000,
  intervalMs = 2_000,
): Promise<PollResultResponse['data']> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${BASE_URL}/agent/ai-image-generation/result/${encodeURIComponent(taskCode)}`,
      { headers: { accessToken } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Poll failed: ${text}`);
    }
    const json: PollResultResponse = await res.json();
    const { status, image_urls } = json.data;

    if (status === 'SUCCESS') {
      return json.data;
    }
    if (status === 'FAILED') {
      throw new Error(json.data.failure_reason || 'Image generation task failed on server.');
    }
    // PENDING / PROCESSING — keep polling

    // Still PENDING — wait and retry
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Image generation timed out after 120 seconds.');
}
