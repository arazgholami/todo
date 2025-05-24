class TodoSync {
    constructor() {
        this.peer = null;
        this.connections = new Map();
        this.roomId = localStorage.getItem('todoRoomId');
        this.isHost = localStorage.getItem('todoIsHost') === 'true';
        this.syncInProgress = false;
    }

    async initialize() {
        localforage.config({
            name: 'todo-app',
            storeName: 'todos'
        });

        // Fetch TURN server credentials
        const response = await fetch("https://todo.metered.live/api/v1/turn/credentials?apiKey=fce152139d6e90ad8be6deaa71200beca71a");
        const iceServers = await response.json();

        this.peer = new Peer(null, {
            config: {
                'iceServers': iceServers,
                'sdpSemantics': 'unified-plan',
                'iceCandidatePoolSize': 10
            },
            debug: 3 // Keep debug level high for testing
        });
        
        this.peer.on('open', async (id) => {
            console.log('My peer ID is:', id);
            this.setupConnectionHandlers();
            
            // Restore previous connection if exists
            if (this.roomId) {
                if (this.isHost) {
                    // If we were the host, we need to recreate the room
                    console.log('Restoring host connection for room:', this.roomId);
                    await this.createRoom();
                } else {
                    // If we were a client, we need to reconnect
                    console.log('Restoring client connection to room:', this.roomId);
                    await this.joinRoom(this.roomId);
                }
            }
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            const errorMessage = typeof err === 'object' ? JSON.stringify(err) : err.toString();
            if (err.type === 'peer-unavailable') {
                alert('Peer is unavailable. Please check if the peer ID is correct and the peer is online.');
            } else if (err.type === 'network') {
                alert('Network error. Please check your internet connection.');
            } else if (err.type === 'webrtc') {
                alert('WebRTC error. This might be due to browser compatibility or network restrictions.');
            } else {
                alert('Connection error: ' + errorMessage);
            }
        });

        this.peer.on('connection', (conn) => {
            conn.on('iceStateChange', (state) => {
                console.log('ICE connection state:', state);
                if (state === 'failed') {
                    console.error('ICE connection failed. Attempting to reconnect...');
                    this.reconnect(conn.peer);
                }
            });
            this.handleConnection(conn);
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
        localStorage.setItem('todoRoomId', this.roomId);
        localStorage.setItem('todoIsHost', 'true');
        return this.roomId;
    }

    async joinRoom(roomId) {
        try {
            this.isHost = false;
            this.roomId = roomId;
            localStorage.setItem('todoRoomId', roomId);
            localStorage.setItem('todoIsHost', 'false');
            
            console.log('Attempting to join room:', roomId);
            const conn = this.peer.connect(roomId, {
                reliable: true
            });
            
            if (!conn) {
                alert('Failed to create connection to room: ' + roomId);
                return false;
            }
            
            this.handleConnection(conn);
            return true;
        } catch (error) {
            const errorMessage = typeof error === 'object' ? JSON.stringify(error) : error.toString();
            alert('Error joining room: ' + errorMessage);
            console.error(error);
            return false;
        }
    }

    async sendState(conn) {
        if (this.syncInProgress) return;
        
        try {
            const state = await localforage.getItem('todoAppState');
            if (state) {
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
                
                const parsedCurrentState = typeof currentState === 'string' ? JSON.parse(currentState) : currentState;
                const parsedNewState = typeof newState === 'string' ? JSON.parse(newState) : newState;
                
                // Ensure categories exist in the new state
                if (!parsedNewState.categories || !Array.isArray(parsedNewState.categories)) {
                    parsedNewState.categories = [{ id: 'default', name: 'General', isDefault: true }];
                }
                
                // Ensure todos have proper category references
                if (parsedNewState.todos && Array.isArray(parsedNewState.todos)) {
                    parsedNewState.todos.forEach(todo => {
                        if (!todo.categoryId || !parsedNewState.categories.some(c => c.id === todo.categoryId)) {
                            todo.categoryId = 'default';
                        }
                    });
                }
                
                const mergedState = this.mergeStates(parsedCurrentState, parsedNewState);
                
                await localforage.setItem('todoAppState', JSON.stringify(mergedState));
                
                if (typeof window.loadData === 'function') {
                    await window.loadData();
                }
            } catch (error) {
                const errorMessage = typeof error === 'object' ? JSON.stringify(error) : error.toString();
                console.error('Error during sync:', errorMessage);
                alert('Error during sync: ' + errorMessage);
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
        
        currentTodos.forEach(todo => {
            todoMap.set(todo.id, todo);
        });
        
        newTodos.forEach(todo => {
            const existing = todoMap.get(todo.id);
            if (!existing) {
                todoMap.set(todo.id, todo);
            } else if (todo.updatedAt > existing.updatedAt) {
                todoMap.set(todo.id, todo);
            }
        });

        return Array.from(todoMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    mergeCategories(currentCategories, newCategories) {
        const categoryMap = new Map();
        
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

    async reconnect(peerId) {
        try {
            console.log('Attempting to reconnect to peer:', peerId);
            const conn = this.peer.connect(peerId, {
                reliable: true,
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });
            
            if (conn) {
                this.handleConnection(conn);
            }
        } catch (error) {
            console.error('Reconnection failed:', error);
        }
    }
}

const todoSync = new TodoSync();
todoSync.initialize();

window.todoSync = todoSync; 