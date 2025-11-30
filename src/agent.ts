export interface Env {
  AI: any;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  dueDate: string;
  createdAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export class TaskAgent {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    
    this.state.blockConcurrencyWhile(async () => {
      await this.initializeDatabase();
    });
  }

  async initializeDatabase() {
    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        completed INTEGER DEFAULT 0,
        dueDate TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    if (url.pathname === '/api/tasks') {
      if (request.method === 'GET') {
        return this.getTasks();
      } else if (request.method === 'POST') {
        return this.createTask(request);
      }
    }

    if (url.pathname.match(/\/api\/tasks\/[\w-]+/)) {
      const taskId = url.pathname.split('/').pop()!;
      if (request.method === 'PUT') {
        return this.updateTask(taskId, request);
      } else if (request.method === 'DELETE') {
        return this.deleteTask(taskId);
      }
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return this.handleChat(request);
    }

    return new Response('Not found', { status: 404 });
  }

  async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    try {
      const messages = await this.getMessages();
      const tasks = await this.getTasksData();
      server.send(JSON.stringify({ type: 'history', messages }));
      server.send(JSON.stringify({ type: 'tasks', tasks }));
    } catch (error) {
      console.error('Error sending history:', error);
    }

    return new Response(null, {
      status: 101,
      webSocket: client as any,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'chat') {
        await this.saveMessage('user', data.content);
        
        const response = await this.getAIResponse(data.content);
        
        await this.saveMessage('assistant', response);
        
        ws.send(JSON.stringify({
          type: 'message',
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString()
        }));

        const tasks = await this.getTasksData();
        ws.send(JSON.stringify({ type: 'tasks', tasks }));
        
        this.broadcast(JSON.stringify({ type: 'tasks', tasks }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: `Failed to process message: ${errorMessage}` 
      }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
  }

  broadcast(message: string) {
    this.sessions.forEach(session => {
      try {
        session.send(message);
      } catch (err) {
        this.sessions.delete(session);
      }
    });
  }

  async getAIResponse(userMessage: string): Promise<string> {
    const tasks = await this.getTasksData();
    
    const systemPrompt = `You are an AI task manager assistant. Help users manage their tasks through natural conversation.

Current tasks:
${tasks.map(t => `- [${t.id.slice(0,8)}] ${t.title} (${t.priority} priority, ${t.completed ? 'completed' : 'active'})`).join('\n') || 'No tasks yet'}

You can help users:
1. Add new tasks - extract title, priority, and due date
2. Mark tasks complete - use task ID or description
3. Suggest priorities and focus areas
4. Break down complex tasks
5. Answer questions about their tasks

When adding tasks, respond with this JSON format somewhere in your response:
{"action": "add_task", "title": "task name", "priority": "high/medium/low", "dueDate": "YYYY-MM-DD"}

When completing tasks, include:
{"action": "complete_task", "taskId": "id"}

Be conversational and helpful!`;

    try {
      let response: any;
      
      // Try messages format first (standard for chat models)
      try {
        response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 512,
          temperature: 0.7
        });
      } catch (messagesError) {
        // Fallback to prompt format if messages doesn't work
        console.log('Messages format failed, trying prompt format:', messagesError);
        const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\nAssistant:`;
        response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          prompt: fullPrompt,
          max_tokens: 512,
          temperature: 0.7
        });
      }

      // Handle different response formats
      let aiMessage = '';
      if (typeof response === 'string') {
        aiMessage = response;
      } else if (response && response.response) {
        aiMessage = response.response;
      } else if (response && response.text) {
        aiMessage = response.text;
      } else if (response && response.description) {
        aiMessage = response.description;
      } else if (response && typeof response === 'object') {
        // Try to find any string property
        for (const key in response) {
          if (typeof response[key] === 'string' && response[key].length > 0) {
            aiMessage = response[key];
            break;
          }
        }
        if (!aiMessage) {
          console.error('Unexpected AI response format:', response);
          aiMessage = JSON.stringify(response);
        }
      } else {
        aiMessage = String(response || '');
      }
      
      // Clean up the response
      aiMessage = aiMessage.trim();
      
      if (aiMessage.includes('"action"')) {
        try {
          const actionMatch = aiMessage.match(/\{[^}]*"action"[^}]*\}/);
          if (actionMatch) {
            const action = JSON.parse(actionMatch[0]);
            await this.handleAIAction(action);
            aiMessage = aiMessage.replace(actionMatch[0], '').trim();
          }
        } catch (e) {
          console.error('Failed to parse AI action:', e);
        }
      }

      return aiMessage || "I'm here to help you manage your tasks!";
    } catch (error) {
      console.error('AI Error:', error);
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error;
      console.error('Error details:', JSON.stringify(errorDetails, null, 2));
      return "I'm having trouble connecting to the AI service right now. Please try again in a moment.";
    }
  }

  async handleAIAction(action: any) {
    if (action.action === 'add_task') {
      const taskId = crypto.randomUUID();
      const dueDate = action.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      
      await this.state.storage.sql.exec(
        'INSERT INTO tasks (id, title, priority, dueDate) VALUES (?, ?, ?, ?)',
        taskId,
        action.title,
        action.priority || 'medium',
        dueDate
      );
    } else if (action.action === 'complete_task' && action.taskId) {
      await this.state.storage.sql.exec(
        'UPDATE tasks SET completed = 1 WHERE id LIKE ?',
        action.taskId + '%'
      );
    }
  }

  async saveMessage(role: string, content: string) {
    try {
      await this.state.storage.sql.exec(
        'INSERT INTO messages (role, content) VALUES (?, ?)',
        role,
        content
      );
    } catch (error) {
      console.error('Error saving message:', error);
      // Don't throw - allow the conversation to continue even if message saving fails
    }
  }

  async getMessages(): Promise<Message[]> {
    try {
      const result = await this.state.storage.sql.exec(
        'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50'
      );
      return (result.toArray() as any[]).map((row: any) => ({
        role: row.role,
        content: row.content,
        timestamp: row.timestamp
      })).reverse();
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  async getTasks(): Promise<Response> {
    const tasks = await this.getTasksData();
    return new Response(JSON.stringify({ tasks }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  async getTasksData(): Promise<Task[]> {
    try {
      const result = await this.state.storage.sql.exec(
        'SELECT * FROM tasks ORDER BY createdAt DESC'
      );
      return (result.toArray() as any[]).map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        completed: row.completed === 1,
        dueDate: row.dueDate,
        createdAt: row.createdAt
      }));
    } catch (error) {
      console.error('Error getting tasks:', error);
      return [];
    }
  }

  async createTask(request: Request): Promise<Response> {
    const { title, description, priority, dueDate } = await request.json() as any;
    const taskId = crypto.randomUUID();
    const finalDueDate = dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    
    await this.state.storage.sql.exec(
      'INSERT INTO tasks (id, title, description, priority, dueDate) VALUES (?, ?, ?, ?, ?)',
      taskId,
      title,
      description || '',
      priority || 'medium',
      finalDueDate
    );

    this.broadcast(JSON.stringify({ type: 'task_added', taskId }));

    return new Response(JSON.stringify({ success: true, taskId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async updateTask(taskId: string, request: Request): Promise<Response> {
    const updates = await request.json() as any;
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates).map((val: any) => {
      // Convert boolean to integer for SQL
      if (typeof val === 'boolean') {
        return val ? 1 : 0;
      }
      return val;
    });
    
    // exec accepts rest parameters, so spread the values array and add taskId
    await this.state.storage.sql.exec(
      `UPDATE tasks SET ${fields} WHERE id = ?`,
      ...values,
      taskId
    );

    this.broadcast(JSON.stringify({ type: 'task_updated', taskId }));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async deleteTask(taskId: string): Promise<Response> {
    await this.state.storage.sql.exec('DELETE FROM tasks WHERE id = ?', taskId);
    
    this.broadcast(JSON.stringify({ type: 'task_deleted', taskId }));
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handleChat(request: Request): Promise<Response> {
    const { message } = await request.json() as any;
    const response = await this.getAIResponse(message);
    
    await this.saveMessage('user', message);
    await this.saveMessage('assistant', response);

    return new Response(JSON.stringify({ response }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}