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
        // Ensure all todos have a link property
        if (state.todos && Array.isArray(state.todos)) {
            state.todos.forEach(todo => {
                if (!('link' in todo)) todo.link = undefined;
            });
        }
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

        renderApp();
        await saveData();
        deleteCategoryModal.hide();
        currentDeletingCategoryId = null;
    }
}

async function addTodo() {
    const todoText = newTodoInput.value.trim();
    const todoLinkInput = document.getElementById('new-todo-link');
    const todoLink = todoLinkInput ? todoLinkInput.value.trim() : '';
    if (todoText) {
        const now = Date.now();
        const categoryTodos = state.todos.filter(t => t.categoryId === state.currentCategoryId);
        const maxOrder = categoryTodos.length > 0 ? Math.max(...categoryTodos.map(t => t.order || 0)) : -1;
        const newTodo = {
            id: generateId(),
            text: todoText,
            completed: false,
            categoryId: state.currentCategoryId,
            createdAt: now,
            updatedAt: now,
            order: maxOrder + 1,
            link: todoLink || undefined
        };
        state.todos.unshift(newTodo);
        newTodoInput.value = '';
        if (todoLinkInput) todoLinkInput.value = '';
        renderTodos();
        await saveData();
    }
}

async function toggleTodo(todoId) {
    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        const now = Date.now();
        todo.completed = !todo.completed;
        todo.updatedAt = now;

        if (todo.completed) {
            todo.completedAt = now;
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
    if (currentCategoryTitle) {
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
    }

    let filteredTodos = state.todos.filter(todo => todo.categoryId === state.currentCategoryId);

    const activeTodos = filteredTodos.filter(todo => !todo.completed)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    const completedTodos = filteredTodos.filter(todo => todo.completed)
        .sort((a, b) => b.completedAt - a.completedAt);

    if (activeItemsContainer) {
        activeItemsContainer.innerHTML = '';
        activeTodos.forEach(todo => {
            activeItemsContainer.appendChild(createTodoElement(todo));
        });
        // Add drag-and-drop for active tasks
        addTaskDragAndDropHandlers();
    }

    if (completedItemsContainer) {
        completedItemsContainer.innerHTML = '';
        completedTodos.forEach(todo => {
            completedItemsContainer.appendChild(createTodoElement(todo));
        });
    }
}

// --- Drag and drop for tasks ---
function addTaskDragAndDropHandlers() {
    const taskElements = activeItemsContainer.querySelectorAll('.todo-item');
    let draggingEl = null;

    taskElements.forEach(el => {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
            draggingEl = el;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
            draggingEl = null;
            el.classList.remove('dragging');
        });
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggingEl || draggingEl === el) return;
            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                activeItemsContainer.insertBefore(draggingEl, el);
            } else {
                activeItemsContainer.insertBefore(draggingEl, el.nextSibling);
            }
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            updateTaskOrderFromDOM();
        });
    });
    // Also update order when drag ends (in case drop doesn't fire)
    activeItemsContainer.addEventListener('drop', updateTaskOrderFromDOM);
    activeItemsContainer.addEventListener('dragend', updateTaskOrderFromDOM);
}

function updateTaskOrderFromDOM() {
    const taskElements = activeItemsContainer.querySelectorAll('.todo-item');
    const ids = Array.from(taskElements).map(el => el.dataset.id);
    let changed = false;
    ids.forEach((id, idx) => {
        const todo = state.todos.find(t => t.id === id);
        if (todo && todo.order !== idx) {
            todo.order = idx;
            changed = true;
        }
    });
    if (changed) {
        saveData();
        renderTodos();
    }
}

function createTodoElement(todo) {
    const todoEl = document.createElement('div');
    todoEl.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    todoEl.draggable = true;
    todoEl.dataset.id = todo.id;

    const todoContent = document.createElement('div');
    todoContent.className = 'todo-content';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggleTodo(todo.id));
    checkbox.style.marginRight = '5px'; // Add margin between checkbox and title

    const todoText = document.createElement('span');
    todoText.className = 'todo-text';
    todoText.textContent = todo.text || '';

    todoContent.appendChild(checkbox);
    todoContent.appendChild(todoText);

    // Add link if present
    let linkEl = null;
    if (todo.link) {
        linkEl = document.createElement('a');
        linkEl.href = todo.link;
        linkEl.textContent = 'Link';
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.className = 'todo-link ms-2';
        todoContent.appendChild(linkEl);
    }

    todoEl.appendChild(todoContent);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'todo-actions';

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

    // Add click event to toggle checkbox when clicking on the todo item (except link or actions)
    todoEl.addEventListener('click', function(e) {
        // Don't toggle if clicking on a link or action button
        if (
            (linkEl && linkEl.contains(e.target)) ||
            actionsDiv.contains(e.target) ||
            checkbox.contains(e.target)
        ) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        toggleTodo(todo.id);
    });

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


async function setReminder(todoId, date, time) {
    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        const [year, month, day] = date.split('-').map(Number);
        const [hours, minutes] = time.split(':').map(Number);
        const reminderDate = new Date(year, month - 1, day, hours, minutes);
        
        // Clear any existing reminder
        if (todo.notificationTimeout) {
            clearTimeout(todo.notificationTimeout);
            todo.notificationTimeout = null;
        }
        
        todo.reminder = reminderDate.getTime();
        await saveData();
        renderTodos();
        scheduleNotification(todo);
    }
}

function scheduleNotification(todo) {
    if (!todo.reminder) return;
    const reminderTime = new Date(todo.reminder);
    const now = new Date();
    if (reminderTime > now) {
        const timeUntilReminder = reminderTime - now;
        if (todo.notificationTimeout) {
            clearTimeout(todo.notificationTimeout);
        }
        todo.notificationTimeout = setTimeout(() => {
            // Always play sound, even if notification is not shown
            try {
                notificationSound.currentTime = 0;
                notificationSound.play();
            } catch (error) {
                console.error('Error playing notification sound:', error);
            }
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification('Task Reminder', {
                    body: todo.text,
                    icon: 'todo.png'
                });
                notification.onclick = function() {
                    window.focus();
                    this.close();
                };
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
    // Add Enter key support for link input
    const newTodoLinkInput = document.getElementById('new-todo-link');
    if (newTodoLinkInput) {
        newTodoLinkInput.addEventListener('keypress', function(e) {
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
    // iOS PWA keyboard fix: force focus on touchend
    function addTouchFocusFix(input) {
        if (!input) return;
        input.addEventListener('touchend', function() {
            setTimeout(() => input.focus(), 0);
        });
    }
    addTouchFocusFix(newCategoryInput);
    addTouchFocusFix(newTodoInput);
    addTouchFocusFix(document.getElementById('new-todo-link'));
    addTouchFocusFix(document.getElementById('current-category-title'));
    addTouchFocusFix(document.getElementById('sync-userid'));
});
// Patch for after pulling data: ensure currentCategoryId is valid and UI updates
if (typeof window !== 'undefined') {
    window.ensureValidCategoryAfterPull = function() {
        if (!state.categories.some(c => c.id === state.currentCategoryId)) {
            state.currentCategoryId = state.categories[0]?.id || 'default';
        }
        renderApp();
    }
}
