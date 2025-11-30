import { TaskAgent } from './agent';

export { TaskAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade for real-time chat
    if (url.pathname === '/api/chat') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        const agentId = env.TASK_AGENT.idFromName('user-session');
        const agent = env.TASK_AGENT.get(agentId);
        return agent.fetch(request);
      }
    }
    
    // Handle HTTP API requests
    if (url.pathname.startsWith('/api/')) {
      const agentId = env.TASK_AGENT.idFromName('user-session');
      const agent = env.TASK_AGENT.get(agentId);
      return agent.fetch(request);
    }
    
    // Serve static site
    return env.ASSETS.fetch(request);
  }
};

interface Env {
  AI: any;
  TASK_AGENT: DurableObjectNamespace;
  ASSETS: Fetcher;
}
