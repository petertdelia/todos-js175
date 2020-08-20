const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const TodoList = require("./lib/todolist");
const Todo = require("./lib/todo");
const { sortTodoLists, sortTodos } = require("./lib/sort");
const store = require("connect-loki");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000,
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));
app.use(flash());
app.use((req, res, next) => {
  let todoLists = [];
  if ("todoLists" in req.session) {
    req.session.todoLists.forEach(todoList => {
      todoLists.push(TodoList.makeTodoList(todoList));
    });
  }

  req.session.todoLists = todoLists;
  next();
})

app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

const loadTodoList = (todoListId, todoLists) => {
  return todoLists.find(list => list.id === todoListId);
}

const loadTodo = (todoListId, todoId, todoLists) => {
  let todoList = loadTodoList(todoListId, todoLists);
  if (!todoList) return undefined;
  return todoList.findById(todoId);
}

const deleteTodo = (todoListId, todo, todoLists) => {
  let todoList = loadTodoList(todoListId, todoLists);
  let todoIndex = todoList.findIndexOf(todo);
  todoList.removeAt(todoIndex);
}

app.get("/", (req, res) => {
  res.redirect("/lists");
});

app.get("/lists", (req, res) => {
  res.render("lists", {
    todoLists: sortTodoLists(req.session.todoLists),
  });
});

app.get("/lists/new", (req, res) => {
  res.render("new-list");
});

app.get("/lists/:todoListId", (req, res, next) => {
  const todoList = loadTodoList(+req.params.todoListId, req.session.todoLists);
  if (!todoList) {
    next(new Error(`No TodoList found`));
  } else {
    res.render("list", {
      todoList,
      todos: sortTodos(todoList),
    });
  }
});

app.get("/lists/:todoListId/edit", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) next(new Error("Invalid Id"));
  else {
    res.render("edit-list", { todoList });  
  }
});

app.post("/lists/:todoListId/edit", 
  [
    body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters")
    .custom(title => {
      let duplicate = req.session.todoLists.find(list => list.title === title);
      return duplicate === undefined;
    })
    .withMessage("List title must be unique")
  ],
  (req, res) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) next(new Error("Invalid Id"));

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("edit-list", {
        flash: req.flash(),
        todoList,
      });
    } else {
      todoList.setTitle(req.body.todoListTitle);
      req.flash("success", "The todo list title has been updated.")
      res.redirect(`/lists/${todoListId}`);
    }    
  }
);

app.post("/lists/:todoListId/destroy", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) next(new Error("Invalid Id"));
  else {
    let index = req.session.todoLists.indexOf(todoList);
    let title = todoList.title;
    req.session.todoLists.splice(index, 1);
    req.flash("success", `${title} has been deleted`);
    res.redirect("/lists");
  }
})

app.post("/lists/:todoListId/complete_all", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId, req.session.todoLists);
  if (!todoList) next(new Error("Invalid Id"));
  let title = todoList.title;
  todoList.markAllDone();
  req.flash("success", `All todos in ${title} have been marked done`);
  res.redirect(`/lists/${todoListId}`);
});

app.post("/lists/:todoListId/todos/:todoId/toggle", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todo = loadTodo(+todoListId, +req.params.todoId, req.session.todoLists);
  if (!todo) next(new Error("Invalid Id"));
  let title = todo.title;
  if (todo.isDone()) {
    todo.markUndone();
    req.flash("success", `${title} has been marked NOT done`);
  }
  else {
    todo.markDone();
    req.flash("success", `${title} has been marked done`);
  }
  res.redirect(`/lists/${todoListId}`);
});

app.post("/lists/:todoListId/todos/:todoId/destroy", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todo = loadTodo(+todoListId, +req.params.todoId, req.session.todoLists);
  if (!todo) next(new Error("Invalid Id"));
  let title = todo.title;
  deleteTodo(+todoListId, todo, req.session.todoLists);
  req.flash("success", `${title} has been deleted`);
  res.redirect(`/lists/${todoListId}`);
});

app.post("/lists/:todoListId/todos", [
    body("todoTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The todo title is required.")
    .isLength({ max: 100 })
    .withMessage("Todo title must be between 1 and 100 characters")
  ],
  (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = loadTodoList(+todoListId, req.session.todoLists);
    if (!todoList) next(new Error("Invalid Id"));

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("list", {
        flash: req.flash(),
        todoList: todoList,
        todos: sortTodos(todoList),
        todoTitle: req.body.todoTitle,
      });
    } else {
      todoList.add(new Todo(req.body.todoTitle));
      req.flash("success", `Todo has been created!`);
      res.redirect(`/lists/${todoListId}`);
    }
  }
);

app.post("/lists",
  [
    body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters")
    .custom((title, { req }) => {
      let duplicate = req.session.todoLists.find(list => list.title === title);
      return duplicate === undefined;
    })
    .withMessage("List title must be unique")
  ],
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    } else {
      req.session.todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created.")
      res.redirect("/lists");
    }    
  }
);

app.use((err, req, res, next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});
