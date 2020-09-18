const SeedData = require("./seed-data");
const nextId = require("./next-id");
const deepCopy = require("./deep-copy");
const { sortTodoLists, sortTodos } = require("./sort");

module.exports = class SessionPersistence {
  constructor(session) {
    this._todoLists = session.todoLists || deepCopy(SeedData);
    session.todoLists = this._todoLists;
  }

  isUniqueConstraintViolation(_error) {
    return false;
  }

  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  sortedTodos(todoList) {
    let undone = todoList.todos.filter(todo => !todo.done);
    let done = todoList.todos.filter(todo => todo.done);
    return deepCopy(sortTodos(undone, done));
  }

  sortedTodoLists() {
    let todoLists = deepCopy(this._todoLists);
    let undone = todoLists.filter(todoList => !this.isDoneTodoList(todoList));
    let done = todoLists.filter(todoList => this.isDoneTodoList(todoList));
    return sortTodoLists(undone, done);
  }

  loadTodoList(todoListId) {
    let todoList = this._findTodoList(todoListId);
    return deepCopy(todoList);
  }

  loadTodo(todoListId, todoId) {
    let todo = this._findTodo(todoListId, todoId);
    return deepCopy(todo);
  }

  _findTodoList(todoListId) {
    return this._todoLists.find(todoList => todoList.id === todoListId); 
  }

  _findTodo(todoListId, todoId) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return undefined;
    return todoList.todos.find(todo => todo.id === todoId);
  }

  deleteTodo(todoListId, todoId) {
    let todoList = this._findTodoList(todoListId);
    let todo = this._findTodo(todoListId, todoId);
    if (!todo) return false;
    todoList.todos.splice(todoList.todos.indexOf(todo), 1);
    return true;
  }

  deleteTodoList(todoListId) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;
    this._todoLists.splice(this._todoLists.indexOf(todoList), 1);
    return true;
  }

  toggleTodo(todoListId, todoId) {
    let todo = this._findTodo(todoListId, todoId);
    if (!todo) return false;
    todo.done = !todo.done;
    return true;
  }

  markAllDone(todoListId) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;
    todoList.todos.forEach(todo => todo.done = true);
    return true;
  }

  addTodo(todoListId, title) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;
    todoList.todos.push({
      id: nextId(),
      title,
      done: false,
    });
  }

  existsTodoListTitle(title) {
    return this._todoLists.some(todoList => todoList.title === title);
  }

  setTodoListTitle(todoListId, title) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;
    todoList.title = title;
    return true;
  }

  addTodoList(title) {
    this._todoLists.push({
      id: nextId(),
      title,
      todos: [],
    });

    return true;
  }

};
