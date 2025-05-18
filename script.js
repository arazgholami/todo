let state = {
    categories: [
        { id: 'default', name: 'General', isDefault: true }
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
    // Broadcast changes to connected peers
    if (window.todoSync) {
        window.todoSync.broadcastState();
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function renderCategories() {
    categoriesList.innerHTML = '';

    state.categories.forEach(category => {
        const categoryEl = document.createElement('div');
        categoryEl.className = `category-item d-flex justify-content-between align-items-center ${state.currentCategoryId === category.id ? 'active' : ''}`;
        categoryEl.dataset.id = category.id;

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
        const newCategory = {
            id: generateId(),
            name: categoryName,
            isDefault: false
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

        renderApp();
        await saveData();
        deleteCategoryModal.hide();
        currentDeletingCategoryId = null;
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
            createdAt: Date.now()
        };

        state.todos.unshift(newTodo);
        newTodoInput.value = '';
        renderTodos();
        await saveData();
    }
}

async function toggleTodo(todoId) {
    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        todo.completed = !todo.completed;

        if (todo.completed) {
            todo.completedAt = Date.now();
        }
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
        await saveData();
        renderTodos();
        moveTaskModal.hide();
    }
}

function renderTodos() {
    const currentCategory = state.categories.find(c => c.id === state.currentCategoryId);
    currentCategoryTitle.value = currentCategory ? currentCategory.name : 'General';


    currentCategoryTitle.readOnly = true;
    currentCategoryTitle.ondblclick = function() {
        this.readOnly = false;
        this.focus();
        this.select();
    };
    currentCategoryTitle.onblur = function() {
        if (!this.readOnly) {
            const newName = this.value.trim();
            if (newName) {
                const category = state.categories.find(c => c.id === state.currentCategoryId);
                if (category) {
                    category.name = newName;
                    saveData();
                    renderCategories();
                }
            }
            this.readOnly = true;
        }
    };
    currentCategoryTitle.onkeypress = function(e) {
        if (e.key === 'Enter') {
            this.blur();
        }
    };


    let filteredTodos = state.todos.filter(todo => todo.categoryId === state.currentCategoryId);


    const activeTodos = filteredTodos.filter(todo => !todo.completed)
    .sort((a, b) => b.createdAt - a.createdAt);

    const completedTodos = filteredTodos.filter(todo => todo.completed)
    .sort((a, b) => b.completedAt - a.completedAt);


    activeItemsContainer.innerHTML = '';
    activeTodos.forEach(todo => {
        activeItemsContainer.appendChild(createTodoElement(todo));
    });


    completedItemsContainer.innerHTML = '';
    completedTodos.forEach(todo => {
        completedItemsContainer.appendChild(createTodoElement(todo));
    });
}

function createTodoElement(todo) {
    const todoEl = document.createElement('div');
    todoEl.className = `todo-item ${todo.completed ? 'completed' : ''} ${state.editingTodo === todo.id ? 'editing' : ''}`;
    todoEl.dataset.id = todo.id;
    todoEl.draggable = true;

    todoEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', todo.id);
        todoEl.classList.add('dragging');
    });

    todoEl.addEventListener('dragend', () => {
        todoEl.classList.remove('dragging');
    });

    todoEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingEl = document.querySelector('.dragging');
        if (draggingEl !== todoEl) {
            const rect = todoEl.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                todoEl.parentNode.insertBefore(draggingEl, todoEl);
            } else {
                todoEl.parentNode.insertBefore(draggingEl, todoEl.nextSibling);
            }
        }
    });

    todoEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        const draggedTodo = state.todos.find(t => t.id === draggedId);
        const targetTodo = state.todos.find(t => t.id === todo.id);
        
        if (draggedTodo && targetTodo) {
            const draggedIndex = state.todos.indexOf(draggedTodo);
            const targetIndex = state.todos.indexOf(targetTodo);
            
            // Remove the dragged todo
            state.todos.splice(draggedIndex, 1);
            // Insert it at the new position
            state.todos.splice(targetIndex, 0, draggedTodo);
            
            // Update the createdAt timestamp to maintain the new order
            const now = Date.now();
            state.todos.forEach((todo, index) => {
                todo.createdAt = now - index;
            });
            
            saveData();
            renderTodos();
        }
    });

    const todoContent = document.createElement('div');
    todoContent.className = 'todo-content';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input me-2';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

    const todoText = document.createElement(state.editingTodo === todo.id ? 'input' : 'span');
    if (state.editingTodo === todo.id) {
        todoText.type = 'text';
        todoText.className = 'form-control';
        todoText.value = todo.text;
        todoText.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveEditTodoInline(todo.id, todoText.value);
            }
        });
        todoText.addEventListener('blur', () => {
            saveEditTodoInline(todo.id, todoText.value);
        });
        todoText.focus();
    } else {
        todoText.className = 'todo-text';
        todoText.textContent = todo.text;
        todoText.style.cursor = 'pointer';
        todoText.addEventListener('click', () => toggleTodo(todo.id));
        todoText.addEventListener('dblclick', () => {
            state.editingTodo = todo.id;
            renderTodos();
        });
    }

    todoContent.appendChild(checkbox);
    todoContent.appendChild(todoText);
    todoEl.appendChild(todoContent);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions-div';

    const moveHandle = document.createElement('i');
    moveHandle.className = 'todo-button fas fa-bars move-handle me-2';
    moveHandle.style.cursor = 'grab';
    moveHandle.title = 'Drag to reorder';
    actionsDiv.appendChild(moveHandle);

    if (state.editingTodo === todo.id) {
        const saveIcon = document.createElement('i');
        saveIcon.className = 'todo-button fas fa-save save-icon me-2';
        saveIcon.addEventListener('click', () => {
            saveEditTodoInline(todo.id, todoText.value);
        });
        actionsDiv.appendChild(saveIcon);
    } else {
        const editIcon = document.createElement('i');
        editIcon.className = 'todo-button fas fa-edit edit-icon me-2';
        editIcon.addEventListener('click', () => {
            state.editingTodo = todo.id;
            renderTodos();
        });
        actionsDiv.appendChild(editIcon);
    }

    const moveIcon = document.createElement('i');
    moveIcon.className = 'todo-button fas fa-folder move-icon me-2';
    moveIcon.addEventListener('click', () => prepareMoveTask(todo.id));

    const deleteIcon = document.createElement('i');
    deleteIcon.className = 'todo-button fas fa-trash delete-icon';
    deleteIcon.addEventListener('click', () => {
        currentDeletingTodoId = todo.id;
        deleteTaskModal.show();
    });

    const reminderIcon = document.createElement('i');
    reminderIcon.className = `todo-button fas ${todo.reminder ? 'fa-bell' : 'fa-bell-slash'} reminder-icon me-2`;
    reminderIcon.title = todo.reminder ? 'Reminder set' : 'Set reminder';
    reminderIcon.addEventListener('click', () => {
        currentReminderTodoId = todo.id;
        const reminderDate = document.getElementById('reminder-date');
        const reminderTime = document.getElementById('reminder-time');
        
        if (todo.reminder) {
            reminderDate.value = new Date(todo.reminder).toISOString().split('T')[0];
            reminderTime.value = new Date(todo.reminder).toTimeString().slice(0, 5);
        } else {
            const now = new Date();
            reminderDate.value = now.toISOString().split('T')[0];
            reminderTime.value = now.toTimeString().slice(0, 5);
        }
        
        reminderModal.show();
    });

    actionsDiv.appendChild(moveIcon);
    actionsDiv.appendChild(deleteIcon);
    actionsDiv.appendChild(reminderIcon);
    todoEl.appendChild(actionsDiv);

    return todoEl;
}

async function saveEditTodoInline(todoId, newText) {
    if (newText && newText.trim()) {
        const todo = state.todos.find(t => t.id === todoId);
        if (todo) {
            todo.text = newText.trim();
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
}

// Add sync UI elements to the sidebar
function addSyncUI() {
    const syncContainer = document.createElement('div');
    syncContainer.className = 'sync-container mt-4 p-3';
    syncContainer.innerHTML = `
        <h6 class="mb-3">Sync</h6>
        <div class="d-flex gap-2 mb-2">
            <button class="btn btn-primary btn-sm" id="createRoomBtn">Create Space</button>
            <button class="btn btn-outline-primary btn-sm" id="joinRoomBtn">Join Space</button>
        </div>
        <div id="roomInfo" class="d-none">
            <div class="input-group mb-2">
                <input type="text" class="form-control form-control-sm" id="roomIdInput" readonly>
                <button class="btn btn-outline-secondary btn-sm" id="copyRoomIdBtn">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
            <div class="text-muted small">Share this ID</div>
        </div>
        <div id="joinRoomForm" class="d-none">
            <div class="input-group mb-2">
                <input type="text" class="form-control form-control-sm" id="joinRoomIdInput" placeholder="Enter Space ID">
                <button class="btn btn-primary btn-sm" id="confirmJoinBtn">Join</button>
            </div>
        </div>
    `;
    
    document.querySelector('.sidebar').appendChild(syncContainer);
    
    // Add event listeners
    document.getElementById('createRoomBtn').addEventListener('click', async () => {
        const roomId = await window.todoSync.createRoom();
        document.getElementById('roomIdInput').value = roomId;
        document.getElementById('roomInfo').classList.remove('d-none');
        document.getElementById('joinRoomForm').classList.add('d-none');
    });
    
    document.getElementById('joinRoomBtn').addEventListener('click', () => {
        document.getElementById('joinRoomForm').classList.remove('d-none');
        document.getElementById('roomInfo').classList.add('d-none');
    });
    
    document.getElementById('copyRoomIdBtn').addEventListener('click', () => {
        const roomIdInput = document.getElementById('roomIdInput');
        roomIdInput.select();
        document.execCommand('copy');
    });
    
    document.getElementById('confirmJoinBtn').addEventListener('click', async () => {
        const roomId = document.getElementById('joinRoomIdInput').value.trim();
        if (roomId) {
            await window.todoSync.joinRoom(roomId);
            document.getElementById('joinRoomForm').classList.add('d-none');
        }
    });
}

// Add these new functions for reminder handling
async function setReminder(todoId, date, time) {
    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        const reminderDate = new Date(`${date}T${time}`);
        todo.reminder = reminderDate.getTime();
        await saveData();
        renderTodos();
        scheduleNotification(todo);
    }
}

function scheduleNotification(todo) {
    if (!todo.reminder) return;
    
    const now = Date.now();
    const timeUntilReminder = todo.reminder - now;
    
    if (timeUntilReminder > 0) {
        setTimeout(() => {
            if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                    new Notification('Task Reminder', {
                        body: todo.text,
                        icon: './todo-icon.png'
                    });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(permission => {
                        if (permission === 'granted') {
                            new Notification('Task Reminder', {
                                body: todo.text,
                                icon: './todo-icon.png'
                            });
                        }
                    });
                }
            }
        }, timeUntilReminder);
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

    // Add sync UI
    addSyncUI();

    confirmReminderBtn.addEventListener('click', () => {
        const date = document.getElementById('reminder-date').value;
        const time = document.getElementById('reminder-time').value;
        
        if (date && time) {
            setReminder(currentReminderTodoId, date, time);
            reminderModal.hide();
        }
    });
    
    // Request notification permission on startup
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    
    // Schedule notifications for existing reminders
    state.todos.forEach(todo => {
        if (todo.reminder) {
            scheduleNotification(todo);
        }
    });
});
