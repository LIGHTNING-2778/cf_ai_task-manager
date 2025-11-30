const API_BASE = window.location.origin;
let ws = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  try {
    setupEventListeners();
    await loadTasks();
    setupWebSocket();
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to initialize application. Please refresh the page.');
  }
});

function setupWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          addMessage(data.role, data.content);
        } else if (data.type === 'tasks') {
          updateTasksList(data.tasks);
        } else if (data.type === 'history') {
          if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach(msg => addMessage(msg.role, msg.content));
          }
        } else if (data.type === 'error') {
          showError(data.message || 'An error occurred');
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      showError('WebSocket connection error. Some features may not work.');
    };
    
    ws.onclose = () => {
      console.log('WebSocket closed');
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (ws?.readyState === WebSocket.CLOSED) {
          setupWebSocket();
        }
      }, 3000);
    };
  } catch (error) {
    console.error('Error setting up WebSocket:', error);
    showError('Failed to connect to server. Please refresh the page.');
  }
}

function showError(message) {
  const container = document.getElementById('messages');
  if (container) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'flex justify-center';
    errorDiv.innerHTML = `
      <div class="max-w-[80%] rounded-lg px-4 py-2 bg-red-100 text-red-800 border border-red-300">
        ${message}
      </div>
    `;
    container.appendChild(errorDiv);
  }
}

function setupEventListeners() {
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showError('Not connected to server. Please wait...');
    return;
  }
  
  addMessage('user', message);
  try {
    ws.send(JSON.stringify({ type: 'chat', content: message }));
    input.value = '';
  } catch (error) {
    console.error('Error sending message:', error);
    showError('Failed to send message. Please try again.');
  }
}

function addMessage(role, content) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
  div.innerHTML = `
    <div class="max-w-[80%] rounded-lg px-4 py-2 ${
      role === 'user' 
        ? 'bg-blue-500 text-white' 
        : 'bg-gray-200 text-gray-800'
    }">
      ${content}
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function loadTasks() {
  try {
    const response = await fetch(`${API_BASE}/api/tasks`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const tasks = data.tasks || [];
    updateTasksList(tasks);
  } catch (error) {
    console.error('Error loading tasks:', error);
    updateTasksList([]);
    showError('Failed to load tasks. Please refresh the page.');
  }
}

function updateTasksList(tasks) {
  const container = document.getElementById('tasks');
  if (!container) return;
  
  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No tasks yet. Ask the AI assistant to add one!</p>';
    return;
  }
  
  container.innerHTML = tasks.map(task => `
    <div class="p-4 bg-white rounded-lg shadow mb-3">
      <div class="flex items-start gap-3">
        <input 
          type="checkbox" 
          ${task.completed ? 'checked' : ''} 
          onchange="toggleTask('${task.id}')"
          class="mt-1"
        >
        <div class="flex-1">
          <h3 class="font-medium ${task.completed ? 'line-through text-gray-500' : ''}">${escapeHtml(task.title || 'Untitled')}</h3>
          <p class="text-sm text-gray-500">${escapeHtml(task.priority || 'medium')} priority${task.dueDate ? ' · Due: ' + escapeHtml(task.dueDate) : ''}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function toggleTask(taskId) {
  try {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    await loadTasks();
  } catch (error) {
    console.error('Error toggling task:', error);
    showError('Failed to update task. Please try again.');
  }
}
