# AI Task Manager - Cloudflare Internship Project


[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20App-orange)](https://ai-task-manager.rohankr2778.workers.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020)](https://workers.cloudflare.com/)

**Live Demo**: [https://ai-task-manager.rohankr2778.workers.dev](https://ai-task-manager.rohankr2778.workers.dev)

An intelligent task management system powered by **Cloudflare Workers AI** and **Llama 3.3**, demonstrating real-time AI-powered task coordination with persistent state management.

## Project Overview

This application showcases all required components for the Cloudflare Summer Internship challenge:
- ✅ **LLM Integration**: Llama 3.3 via Workers AI
- ✅ **Workflow/Coordination**: Durable Objects for state management
- ✅ **User Input**: Real-time WebSocket chat interface
- ✅ **Memory/State**: Persistent SQLite storage with conversation history

## Features

- **Natural Language Task Management**: Create, update, and complete tasks through conversational AI
- **Real-time Synchronization**: WebSocket connections for instant updates
- **Smart Prioritization**: AI suggests which tasks to focus on based on priority and due dates
- **Persistent Storage**: SQLite database maintains tasks and conversation history
- **Intelligent Parsing**: AI automatically extracts task details (title, priority, due date) from natural language

##  Architecture
```
┌─────────────┐
│   User      │
│  Browser    │
└──────┬──────┘
       │ WebSocket
       ↓
┌─────────────────────────────────┐
│  Cloudflare Worker              │
│  (src/index.ts)                 │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│  Durable Object (TaskAgent)     │
│  - WebSocket Handler            │
│  - SQLite Database              │
│  - State Management             │
└──────┬──────────────────────────┘
       │
       ↓
┌─────────────────────────────────┐
│  Workers AI                     │
│  Llama 3.3 (70B)                │
└─────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account (free tier works!)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/cloudflare-ai-task-manager.git
cd cloudflare-ai-task-manager

# Install dependencies
npm install

# Run locally
npx wrangler dev

# Deploy to Cloudflare
npx wrangler deploy
```

### Local Development
```bash
npx wrangler dev
```
Open `http://localhost:8787` in your browser

## Example Interactions

Try these commands:
- "Add a task to prepare for my Cloudflare interview"
- "What should I focus on today?"
- "Mark the first task as complete"
- "Create a high priority task to review Durable Objects documentation due tomorrow"
- "Break down my project into smaller steps"

## Project Structure
```
cloudflare-ai-task-manager/
├── src/
│   ├── index.ts          # Main Worker entry point
│   └── agent.ts          # TaskAgent Durable Object
├── public/
│   ├── index.html        # Frontend UI
│   └── app.js            # Client-side logic
├── wrangler.toml         # Cloudflare configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Technical Highlights

### 1. **Durable Objects for State**
Each user session gets its own Durable Object instance with:
- Isolated SQLite database
- Persistent state across requests
- Real-time WebSocket connections

### 2. **Workers AI Integration**
```typescript
const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ],
  max_tokens: 512,
  temperature: 0.7
});
```

### 3. **Real-time Updates**
WebSocket connections provide instant synchronization between client and server:
- Task updates broadcast to all connected clients
- Conversation history persisted in SQLite
- State changes trigger UI updates

### 4. **Intelligent Task Parsing**
AI extracts structured data from natural language:
```json
{
  "action": "add_task",
  "title": "Prepare for interview",
  "priority": "high",
  "dueDate": "2025-12-05"
}
```

## 🛠️ Technologies Used

- **Cloudflare Workers**: Serverless compute platform
- **Durable Objects**: Stateful coordination and SQLite storage
- **Workers AI**: Llama 3.3 (70B Instruct) for natural language understanding
- **WebSockets**: Real-time bidirectional communication
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Modern, responsive UI

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | WebSocket | Real-time chat connection |
| `/api/tasks` | GET | List all tasks |
| `/api/tasks` | POST | Create new task |
| `/api/tasks/:id` | PUT | Update task |
| `/api/tasks/:id` | DELETE | Delete task |


**Made by Rohan Kapoor**
