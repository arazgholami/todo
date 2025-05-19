let state = {
    categories: [
        { id: 'default', name: 'General', isDefault: true, order: 0 }
    ],
    currentCategoryId: 'default',
    todos: [],
    editingTodo: null,
    editingCategory: null
};

let categoriesList;
let newCategoryInput;
let addCategoryBtn;
let currentCategoryTitle;
let newTodoInput;
let activeItemsContainer;
let completedItemsContainer;
let categorySelect;
let confirmMoveBtn;
let moveTaskModal;
let deleteTaskModal;
let deleteCategoryModal;
let reminderModal;
let confirmReminderBtn;
let currentReminderTodoId = null;
let currentDeletingTodoId = null;
let currentDeletingCategoryId = null;
let sidebarOpen = false;

const notificationSound = new Audio('bell.mp3');

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
        sidebar.classList.add('open');
    } else {
        sidebar.classList.remove('open');
    }
}

async function loadData() {
    const savedState = await localforage.getItem('todoAppState');
    if (savedState) {
        state = JSON.parse(savedState);

        if (!state.categories.some(c => c.id === 'default')) {
            state.categories.push({ id: 'default', name: 'General', isDefault: true });
        }

        state.editingTodo = null;
        state.editingCategory = null;
    }
    renderApp();
}

async function saveData() {
    await localforage.setItem('todoAppState', JSON.stringify(state));
    
    if (window.todoSync) {
        window.todoSync.broadcastState();
    }
}

function generateId() {
    return crypto.randomUUID();
}

function renderCategories() {
    categoriesList.innerHTML = '';
    
    const sortedCategories = [...state.categories].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedCategories.forEach(category => {
        const categoryEl = document.createElement('div');
        categoryEl.className = `category-item d-flex justify-content-between align-items-center ${state.currentCategoryId === category.id ? 'active' : ''}`;
        categoryEl.dataset.id = category.id;
        categoryEl.draggable = true;
        
        categoryEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', category.id);
            categoryEl.classList.add('dragging');
        });

        categoryEl.addEventListener('dragend', () => {
            categoryEl.classList.remove('dragging');
        });

        categoryEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingEl = document.querySelector('.dragging');
            if (draggingEl && draggingEl !== categoryEl) {
                const rect = categoryEl.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    categoryEl.parentNode.insertBefore(draggingEl, categoryEl);
                } else {
                    categoryEl.parentNode.insertBefore(draggingEl, categoryEl.nextSibling);
                }
            }
        });

        categoryEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const draggedCategory = state.categories.find(c => c.id === draggedId);
            const targetCategory = state.categories.find(c => c.id === category.id);
            
            if (draggedCategory && targetCategory) {
                const now = Date.now();
                const container = categoryEl.parentNode;
                const categoryElements = Array.from(container.children);
                const newIndex = categoryElements.indexOf(categoryEl);
                
                categoryElements.forEach((el, index) => {
                    const catId = el.dataset.id;
                    const cat = state.categories.find(c => c.id === catId);
                    if (cat) {
                        cat.order = index;
                    }
                });
                
                saveData();
                renderCategories();
            }
        });

        const nameInputContainer = document.createElement('div');
        nameInputContainer.className = 'flex-grow-1 me-2';

        const nameInput = document.createElement('input');
        nameInput.className = 'category-title-input';
        nameInput.type = 'text';
        nameInput.value = category.name;
        nameInput.readOnly = state.editingCategory !== category.id;
        nameInput.addEventListener('click', (e) => {
            if (state.currentCategoryId !== category.id) {
                e.stopPropagation();
                state.currentCategoryId = category.id;
                renderApp();
                saveData();
            }
        });
        nameInput.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!category.isDefault || (category.isDefault && category.id === 'default')) {
                enableCategoryEdit(category.id);
            }
        });
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveCategoryEdit(category.id, nameInput.value);
            }
        });
        nameInput.addEventListener('blur', () => {
            if (state.editingCategory === category.id) {
                saveCategoryEdit(category.id, nameInput.value);
            }
        });
        nameInputContainer.appendChild(nameInput);
        categoryEl.appendChild(nameInputContainer);

        if (!category.isDefault || (category.isDefault && category.id === 'default')) {
            const actionsDiv = document.createElement('div');

            const editIcon = document.createElement('i');
            editIcon.className = 'category-button fas fa-edit edit-icon me-2';
            editIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                enableCategoryEdit(category.id);
            });
            actionsDiv.appendChild(editIcon);

            if (!category.isDefault) {
                const deleteIcon = document.createElement('i');
                deleteIcon.className = 'category-button fas fa-trash delete-icon';
                deleteIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteCategory(category.id);
                });
                actionsDiv.appendChild(deleteIcon);
            }

            categoryEl.appendChild(actionsDiv);
        }

        categoriesList.appendChild(categoryEl);
    });
}

function enableCategoryEdit(categoryId) {
    state.editingCategory = categoryId;
    renderCategories();

    const categoryInputs = document.querySelectorAll('.category-title-input');
    categoryInputs.forEach(input => {
        const categoryEl = input.closest('.category-item');
        if (categoryEl && categoryEl.dataset.id === categoryId) {
            input.readOnly = false;
            input.focus();
            input.select();
        }
    });
}

async function saveCategoryEdit(categoryId, newName) {
    const category = state.categories.find(c => c.id === categoryId);
    if (category && newName && newName.trim()) {
        category.name = newName.trim();
    }
    state.editingCategory = null;
    renderApp();
    await saveData();
}

async function addCategory() {
    const categoryName = newCategoryInput.value.trim();
    if (categoryName) {
        const maxOrder = state.categories.length > 0 ? Math.max(...state.categories.map(c => c.order || 0)) : -1;
        
        const newCategory = {
            id: generateId(),
            name: categoryName,
            isDefault: false,
            order: maxOrder + 1
        };
        state.categories.push(newCategory);
        newCategoryInput.value = '';
        renderCategories();
        await saveData();
    }
}

function deleteCategory(categoryId) {
    currentDeletingCategoryId = categoryId;
    deleteCategoryModal.show();
}

async function confirmDeleteCategory() {
    if (currentDeletingCategoryId) {
        state.categories = state.categories.filter(c => c.id !== currentDeletingCategoryId);

        if (state.currentCategoryId === currentDeletingCategoryId) {
            state.currentCategoryId = 'default';
        }

        state.todos.forEach(todo => {
            if (todo.categoryId === currentDeletingCategoryId) {
                todo.categoryId = 'default';
            }
        });

        currentDeletingCategoryId = null;
        renderApp();
        await saveData();
    }
}

async function addTodo() {
    const todoText = newTodoInput.value.trim();
    if (todoText) {
        const newTodo = {
            id: generateId(),
            text: todoText,
            completed: false,
            categoryId: state.currentCategoryId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        state.todos.push(newTodo);
        newTodoInput.value = '';
        renderTodos();
        await saveData();
    }
}

async function toggleTodo(todoId) {
    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        todo.completed = !todo.completed;
        todo.updatedAt = Date.now();
        renderTodos();
        await saveData();
    }
}

async function deleteTodo(todoId) {
    state.todos = state.todos.filter(t => t.id !== todoId);
    renderTodos();
    await saveData();
}

function prepareMoveTask(todoId) {
    currentMovingTodoId = todoId;

    categorySelect.innerHTML = '';
    state.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });

    moveTaskModal.show();
}

async function confirmMoveTask() {
    const selectedCategoryId = categorySelect.value;
    const todo = state.todos.find(t => t.id === currentMovingTodoId);

    if (todo && selectedCategoryId) {
        todo.categoryId = selectedCategoryId;
        todo.updatedAt = Date.now();
        await saveData();
        renderTodos();
        moveTaskModal.hide();
    }
}

function renderTodos() {
    activeItemsContainer.innerHTML = '';
    completedItemsContainer.innerHTML = '';

    const currentTodos = state.todos.filter(todo => todo.categoryId === state.currentCategoryId);
    const sortedTodos = [...currentTodos].sort((a, b) => b.createdAt - a.createdAt);

    sortedTodos.forEach(todo => {
        const todoEl = createTodoElement(todo);
        if (todo.completed) {
            completedItemsContainer.appendChild(todoEl);
        } else {
            activeItemsContainer.appendChild(todoEl);
        }
    });
}

function createTodoElement(todo) {
    const todoEl = document.createElement('div');
    todoEl.className = `todo-item ${todo.completed ? 'completed' : ''} ${state.editingTodo === todo.id ? 'editing' : ''}`;
    todoEl.draggable = true;

    todoEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', todo.id);
        todoEl.classList.add('dragging');
    });

    todoEl.addEventListener('dragend', () => {
        todoEl.classList.remove('dragging');
    });

    const contentDiv = document.createElement('div');
    contentDiv.className = 'todo-content';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

    const textDiv = document.createElement('div');
    textDiv.className = 'todo-text';

    if (state.editingTodo === todo.id) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = todo.text;
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveEditTodoInline(todo.id, input.value);
            }
        });
        input.addEventListener('blur', () => {
            saveEditTodoInline(todo.id, input.value);
        });
        input.focus();
        textDiv.appendChild(input);
    } else {
        const text = document.createElement('p');
        text.textContent = todo.text;
        text.addEventListener('dblclick', () => {
            state.editingTodo = todo.id;
            renderTodos();
        });
        textDiv.appendChild(text);
    }

    contentDiv.appendChild(checkbox);
    contentDiv.appendChild(textDiv);
    todoEl.appendChild(contentDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions-div';

    const moveIcon = document.createElement('i');
    moveIcon.className = 'todo-button fas fa-folder move-icon me-2';
    moveIcon.addEventListener('click', () => prepareMoveTask(todo.id));

    const reminderIcon = document.createElement('i');
    reminderIcon.className = `todo-button fas ${todo.reminder ? 'fa-bell' : 'fa-bell-slash'} reminder-icon me-2`;
    reminderIcon.style.color = todo.reminder ? '#ff9800' : '';
    reminderIcon.title = todo.reminder ? 'Disable reminder' : 'Set reminder';
    reminderIcon.addEventListener('click', () => {
        if (todo.reminder) {
            todo.reminder = null;
            if (todo.notificationTimeout) {
                clearTimeout(todo.notificationTimeout);
                todo.notificationTimeout = null;
            }
            saveData();
            renderTodos();
        } else {
            currentReminderTodoId = todo.id;
            const reminderDate = document.getElementById('reminder-date');
            const reminderTime = document.getElementById('reminder-time');
            const now = new Date();
            reminderDate.value = now.toISOString().split('T')[0];
            reminderTime.value = now.toTimeString().slice(0, 5);
            reminderModal.show();
        }
    });

    const deleteIcon = document.createElement('i');
    deleteIcon.className = 'todo-button fas fa-trash delete-icon';
    deleteIcon.addEventListener('click', () => {
        currentDeletingTodoId = todo.id;
        deleteTaskModal.show();
    });

    actionsDiv.appendChild(moveIcon);
    actionsDiv.appendChild(reminderIcon);
    actionsDiv.appendChild(deleteIcon);
    todoEl.appendChild(actionsDiv);

    return todoEl;
}

async function saveEditTodoInline(todoId, newText) {
    if (newText && newText.trim()) {
        const todo = state.todos.find(t => t.id === todoId);
        if (todo) {
            todo.text = newText.trim();
            todo.updatedAt = Date.now();
            state.editingTodo = null;
            renderTodos();
            await saveData();
        }
    } else {
        state.editingTodo = null;
        renderTodos();
    }
}

function renderApp() {
    renderCategories();
    renderTodos();
    const currentCategory = state.categories.find(c => c.id === state.currentCategoryId);
    if (currentCategory) {
        currentCategoryTitle.value = currentCategory.name;
    }
}

function addSyncUI() {
    const syncContainer = document.createElement('div');
    syncContainer.className = 'sync-container';
    syncContainer.innerHTML = `
        <h6>Sync</h6>
        <div id="roomInfo" style="display: none;">
            <div class="input-group">
                <input type="text" class="form-control" id="roomId" readonly>
                <button class="btn btn-outline-secondary" id="copyRoomBtn">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            <div class="text-muted">Share this ID with others to sync</div>
            <div id="connectionStatus">
                <span class="badge bg-secondary">No connections</span>
            </div>
        </div>
        <div id="joinRoomForm">
            <div class="input-group">
                <input type="text" class="form-control" id="joinRoomId" placeholder="Enter room ID">
                <button class="btn btn-outline-secondary" id="joinRoomBtn">
                    <i class="fas fa-sign-in-alt"></i>
                </button>
            </div>
            <div id="joinConnectionStatus">
                <span class="badge bg-secondary">Not connected</span>
            </div>
        </div>
        <button class="btn btn-primary" id="createRoomBtn">Create Room</button>
    `;

    document.querySelector('.footer').appendChild(syncContainer);

    const roomInfo = document.getElementById('roomInfo');
    const joinRoomForm = document.getElementById('joinRoomForm');
    const roomId = document.getElementById('roomId');
    const joinRoomId = document.getElementById('joinRoomId');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const copyRoomBtn = document.getElementById('copyRoomBtn');
    const connectionStatus = document.getElementById('connectionStatus');
    const joinConnectionStatus = document.getElementById('joinConnectionStatus');

    createRoomBtn.addEventListener('click', async () => {
        const id = await window.todoSync.createRoom();
        roomId.value = id;
        roomInfo.style.display = 'block';
        joinRoomForm.style.display = 'none';
        createRoomBtn.style.display = 'none';
    });

    joinRoomBtn.addEventListener('click', async () => {
        const id = joinRoomId.value.trim();
        if (id) {
            const success = await window.todoSync.joinRoom(id);
            if (success) {
                joinRoomForm.style.display = 'none';
                createRoomBtn.style.display = 'none';
                joinConnectionStatus.innerHTML = '<span class="badge bg-success">Connected</span>';
            } else {
                joinConnectionStatus.innerHTML = '<span class="badge bg-danger">Connection failed</span>';
            }
        }
    });

    copyRoomBtn.addEventListener('click', () => {
        roomId.select();
        document.execCommand('copy');
    });

    window.todoSync.peer.on('connection', () => {
        connectionStatus.innerHTML = '<span class="badge bg-success">Connected</span>';
    });

    window.todoSync.peer.on('disconnected', () => {
        connectionStatus.innerHTML = '<span class="badge bg-danger">Disconnected</span>';
    });
}

async function setReminder(todoId, date, time) {
    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        const reminderDate = new Date(`${date}T${time}`);
        todo.reminder = reminderDate.getTime();
        todo.updatedAt = Date.now();
        await saveData();
        renderTodos();
        scheduleNotification(todo);
    }
}

function scheduleNotification(todo) {
    if (todo.reminder) {
        const now = Date.now();
        const timeUntilReminder = todo.reminder - now;

        if (timeUntilReminder > 0) {
            if (todo.notificationTimeout) {
                clearTimeout(todo.notificationTimeout);
            }

            todo.notificationTimeout = setTimeout(() => {
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Todo Reminder', {
                        body: todo.text,
                        icon: 'todo-icon.png'
                    });
                    notificationSound.play();
                }
            }, timeUntilReminder);
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    categoriesList = document.getElementById('categories-list');
    newCategoryInput = document.getElementById('new-category-input');
    addCategoryBtn = document.getElementById('add-category-btn');
    currentCategoryTitle = document.getElementById('current-category-title');
    newTodoInput = document.getElementById('new-todo-input');
    activeItemsContainer = document.getElementById('active-items');
    completedItemsContainer = document.getElementById('completed-items');
    categorySelect = document.getElementById('category-select');
    confirmMoveBtn = document.getElementById('confirm-move-btn');
    moveTaskModal = new bootstrap.Modal(document.getElementById('moveTaskModal'));
    deleteTaskModal = new bootstrap.Modal(document.getElementById('deleteTaskModal'));
    deleteCategoryModal = new bootstrap.Modal(document.getElementById('deleteCategoryModal'));
    reminderModal = new bootstrap.Modal(document.getElementById('reminderModal'));
    confirmReminderBtn = document.getElementById('confirm-reminder-btn');

    loadData();

    const saveTaskBtn = document.getElementById('save-task-btn');
    if (saveTaskBtn) {
        saveTaskBtn.addEventListener('click', addTodo);
    }

    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', addCategory);
    }
    if (newCategoryInput) {
        newCategoryInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addCategory();
            }
        });
    }

    if (newTodoInput) {
        newTodoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addTodo();
            }
        });
    }

    if (confirmMoveBtn) {
        confirmMoveBtn.addEventListener('click', confirmMoveTask);
    }

    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            if (currentDeletingTodoId) {
                deleteTodo(currentDeletingTodoId);
                deleteTaskModal.hide();
                currentDeletingTodoId = null;
            }
        });
    }

    const confirmDeleteCategoryBtn = document.getElementById('confirm-delete-category-btn');
    if (confirmDeleteCategoryBtn) {
        confirmDeleteCategoryBtn.addEventListener('click', confirmDeleteCategory);
    }

    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebarOpen) {
            const sidebar = document.querySelector('.sidebar');
            const sidebarToggle = document.querySelector('.sidebar-toggle');
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                toggleSidebar();
            }
        }
    });
    
    addSyncUI();

    confirmReminderBtn.addEventListener('click', () => {
        const date = document.getElementById('reminder-date').value;
        const time = document.getElementById('reminder-time').value;
        
        if (date && time) {
            setReminder(currentReminderTodoId, date, time);
            reminderModal.hide();
        }
    });
    
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    
    state.todos.forEach(todo => {
        if (todo.reminder) {
            scheduleNotification(todo);
        }
    });
});
