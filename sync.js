class TodoSync {
    constructor() {
        this.peer = null;
        this.connections = new Map();
        this.roomId = null;
        this.isHost = false;
        this.syncInProgress = false;
    }

    async initialize() {
        // Initialize LocalForage
        localforage.config({
            name: 'todo-app',
            storeName: 'todos'
        });

        // Initialize PeerJS
        this.peer = new Peer();
        
        this.peer.on('open', (id) => {
            console.log('My peer ID is:', id);
            this.setupConnectionHandlers();
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
        });
    }

    setupConnectionHandlers() {
        this.peer.on('connection', (conn) => {
            console.log('New connection from:', conn.peer);
            this.handleConnection(conn);
        });
    }

    handleConnection(conn) {
        conn.on('open', () => {
            console.log('Connection opened with:', conn.peer);
            this.connections.set(conn.peer, conn);
            
            // Send current state to the new peer
            this.sendState(conn);
        });

        conn.on('data', (data) => {
            this.handleSyncData(data);
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
        });
    }

    async createRoom() {
        this.isHost = true;
        this.roomId = this.peer.id;
        return this.roomId;
    }

    async joinRoom(roomId) {
        this.isHost = false;
        this.roomId = roomId;
        
        const conn = this.peer.connect(roomId);
        this.handleConnection(conn);
    }

    async sendState(conn) {
        if (this.syncInProgress) return;
        
        try {
            const state = await localforage.getItem('todoAppState');
            if (state) {
                // Send the state as is, since it's already a string
                conn.send({
                    type: 'sync',
                    data: state
                });
            }
        } catch (error) {
            console.error('Error sending state:', error);
        }
    }

    async handleSyncData(data) {
        if (this.syncInProgress) return;
        
        if (data.type === 'sync') {
            this.syncInProgress = true;
            
            try {
                const currentState = await localforage.getItem('todoAppState');
                const newState = data.data;
                
                // Parse both states if they're strings
                const parsedCurrentState = typeof currentState === 'string' ? JSON.parse(currentState) : currentState;
                const parsedNewState = typeof newState === 'string' ? JSON.parse(newState) : newState;
                
                // Merge states, preferring newer items
                const mergedState = this.mergeStates(parsedCurrentState, parsedNewState);
                
                // Save merged state as string
                await localforage.setItem('todoAppState', JSON.stringify(mergedState));
                
                // Trigger UI update
                if (typeof window.loadData === 'function') {
                    await window.loadData();
                }
            } catch (error) {
                console.error('Error during sync:', error);
            } finally {
                this.syncInProgress = false;
            }
        }
    }

    mergeStates(currentState, newState) {
        if (!currentState) return newState;
        if (!newState) return currentState;

        const merged = {
            ...currentState,
            todos: this.mergeTodos(currentState.todos || [], newState.todos || []),
            categories: this.mergeCategories(currentState.categories || [], newState.categories || [])
        };

        return merged;
    }

    mergeTodos(currentTodos, newTodos) {
        const todoMap = new Map();
        
        // Add all todos to map
        [...currentTodos, ...newTodos].forEach(todo => {
            const existing = todoMap.get(todo.id);
            if (!existing || todo.createdAt > existing.createdAt) {
                todoMap.set(todo.id, todo);
            }
        });

        return Array.from(todoMap.values());
    }

    mergeCategories(currentCategories, newCategories) {
        const categoryMap = new Map();
        
        // Add all categories to map
        [...currentCategories, ...newCategories].forEach(category => {
            const existing = categoryMap.get(category.id);
            if (!existing || category.name !== 'General') {
                categoryMap.set(category.id, category);
            }
        });

        return Array.from(categoryMap.values());
    }

    async broadcastState() {
        try {
            const state = await localforage.getItem('todoAppState');
            if (state) {
                for (const conn of this.connections.values()) {
                    await this.sendState(conn);
                }
            }
        } catch (error) {
            console.error('Error broadcasting state:', error);
        }
    }
}

// Initialize sync
const todoSync = new TodoSync();
todoSync.initialize();

// Export for use in script.js
window.todoSync = todoSync; 