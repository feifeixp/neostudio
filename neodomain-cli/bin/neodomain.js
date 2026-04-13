#!/usr/bin/env node
/**
 * Neodomain AI CLI
 * A wrapper to interact with Neodomain APIs cleanly via JSON streams.
 * Usage: neodomain <module> <action> [options]
 */

const BASE_URL_DEV = 'https://dev.neodomain.cn';
const BASE_URL_PROD = 'https://story.neodomain.cn';

// Helper to reliably print JSON to stdout and exit
function outputJsonAndExit(data, isError = false) {
  if (isError) {
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  } else {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }
}

// Parse args
const args = process.argv.slice(2);
if (args.length < 2) {
  outputJsonAndExit({
    error: "Missing arguments. Usage: neodomain <module> <action> [--param value] ...",
    modules: ["auth", "video", "image", "project", "pay"]
  }, true);
}

const [module, action] = args;
const options = {};

// Simple flag parser: --foo bar --baz
for (let i = 2; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].substring(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    options[key] = value;
    if (value !== true) i++; // skip next since it's the value
  }
}

const env = options.env === 'prod' ? BASE_URL_PROD : BASE_URL_DEV;
const accessToken = process.env.NEODOMAIN_ACCESS_TOKEN || options.token || '';

async function makeRequest(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['accessToken'] = accessToken;

  try {
    const res = await fetch(`${env}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    const json = await res.json();
    return json;
  } catch (err) {
    return { success: false, errCode: 'NETWORK_ERROR', errMessage: err.message };
  }
}

async function run() {
  let result;
  
  if (module === 'auth') {
    if (action === 'send-code') {
      result = await makeRequest('/user/login/send-unified-code', 'POST', {
        contact: options.contact,
        userSource: options.userSource || 'SELF'
      });
    } else if (action === 'unified-login') {
      result = await makeRequest('/user/login/unified-login/identity', 'POST', {
        contact: options.contact,
        code: options.code
      });
    } else if (action === 'select-identity') {
      result = await makeRequest('/user/login/select-identity', 'POST', {
        userId: options.userId,
        contact: options.contact
      });
    } else if (action === 'check-exist') {
      result = await makeRequest('/user/login/check-exist', 'POST', {
        contact: options.contact,
        source: options.source || 'LOGIN'
      });
    } else {
      outputJsonAndExit({ error: `Unknown action '${action}' for module '${module}'` }, true);
    }
  } 
  else if (module === 'video') {
    if (action === 'get-models') {
      result = await makeRequest(`/agent/user/video/models/universal/byLogin?requestType=${options.requestType || 2}`);
    } else if (action === 'generate') {
      result = await makeRequest('/agent/user/video/generate', 'POST', {
        modelName: options.modelName,
        generationType: options.generationType,
        prompt: options.prompt,
        firstFrameImageUrl: options.firstFrameImageUrl || undefined,
        aspectRatio: options.aspectRatio || '16:9',
        resolution: options.resolution || '1080p',
        duration: options.duration || '5s'
      });
    } else {
      outputJsonAndExit({ error: `Unknown action '${action}' for module '${module}'` }, true);
    }
  } 
  else if (module === 'image') {
    if (action === 'get-models') {
      result = await makeRequest(`/agent/ai-image-generation/models/by-scenario?scenarioType=${options.scenarioType || 1}`);
    } else if (action === 'generate') {
      result = await makeRequest('/agent/ai-image-generation/generate', 'POST', {
        prompt: options.prompt,
        modelName: options.modelName,
        numImages: options.numImages || "1",
        aspectRatio: options.aspectRatio || '16:9'
      });
    } else if (action === 'query') {
      if (!options.taskCode) outputJsonAndExit({ error: '--taskCode is required' }, true);
      result = await makeRequest(`/agent/ai-image-generation/result/${options.taskCode}`);
    } else {
      outputJsonAndExit({ error: `Unknown action '${action}' for module '${module}'` }, true);
    }
  } 
  else if (module === 'project') {
    if (action === 'list') {
      result = await makeRequest('/agent/project-collaboration/page-query-projects', 'POST', {
        pageNum: options.pageNum ? parseInt(options.pageNum) : 1,
        pageSize: options.pageSize ? parseInt(options.pageSize) : 20
      });
    } else {
      outputJsonAndExit({ error: `Unknown action '${action}' for module '${module}'` }, true);
    }
  } 
  else if (module === 'pay') {
    if (action === 'create') {
      result = await makeRequest('/agent/pay/order/create', 'POST', {
        subject: options.subject,
        amount: parseFloat(options.amount),
        payType: parseInt(options.payType || "1")
      });
    } else if (action === 'status') {
      result = await makeRequest(`/agent/pay/order/status?orderNo=${options.orderNo}`);
    } else {
      outputJsonAndExit({ error: `Unknown action '${action}' for module '${module}'` }, true);
    }
  } 
  else {
    outputJsonAndExit({ error: `Unknown module '${module}'` }, true);
  }

  outputJsonAndExit(result);
}

run();
