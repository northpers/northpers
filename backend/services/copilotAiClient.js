const os = require("os");
const path = require("path");
const { CopilotClient } = require("@github/copilot-sdk");

let client;
let startPromise;

function getClient() {
  if (!client) {
    client = new CopilotClient({
      mode: "empty",
      baseDirectory: process.env.COPILOT_HOME || path.join(os.homedir(), ".copilot"),
      useLoggedInUser: true,
      logLevel: "error",
    });
  }
  return client;
}

async function startClient() {
  if (!startPromise) {
    startPromise = getClient().start().catch((error) => {
      startPromise = null;
      throw error;
    });
  }
  await startPromise;
  const currentClient = getClient();
  const auth = await currentClient.getAuthStatus();
  if (!auth.isAuthenticated) {
    throw new Error(
      "GitHub Copilot belum terautentikasi di server. Jalankan `npx -y @github/copilot login --device-code` sebagai user backend lalu coba lagi.",
    );
  }
  return currentClient;
}

async function sendCopilotPrompt({ model, prompt, systemPrompt, attachments = [], timeout = 120000 }) {
  if (!model || !prompt || !systemPrompt) {
    throw new Error("Model, prompt, dan system prompt wajib diisi");
  }
  const currentClient = await startClient();
  const session = await currentClient.createSession({
    model,
    availableTools: [],
    systemMessage: { mode: "append", content: systemPrompt },
  });

  try {
    const response = await session.sendAndWait(
      attachments.length ? { prompt, attachments } : { prompt },
      timeout,
    );
    const content = response && response.data && response.data.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Copilot tidak mengembalikan jawaban");
    }
    return content;
  } finally {
    await session.disconnect();
  }
}

async function listCopilotModels() {
  const currentClient = await startClient();
  return currentClient.listModels();
}

async function checkCopilotConnection() {
  const currentClient = await startClient();
  return currentClient.ping("Northline AI health check");
}

async function stopCopilotClient() {
  if (!client) return;
  const currentClient = client;
  client = null;
  startPromise = null;
  await currentClient.stop();
}

module.exports = {
  sendCopilotPrompt,
  listCopilotModels,
  checkCopilotConnection,
  stopCopilotClient,
};
